let audioCtx;

let filterNode;
let delayNode;
let delayDryGain;
let delayWetGain;
let delayMixBus;
let feedbackNode;

let reverbNode;
let reverbDryGain;
let reverbWetGain;

let lfoNode;
let lfoDepthNode;
let makeupGainNode;

let loadedImpulse = null;
let impulseLoading = false;

let defaultParams = {
  delayMix: 0.35,
  feedback: 0.6,
  pitch: 0,
  bpm: 120,
  tempoMode: true,
  step: 1,
  time: 0.1667,
  reverbMix: 0,
  reverbType: "church",
  filterFreq: 20000,
  filterType: "lowpass",
  filterQ: 1.0,
  lfoOn: false,
  lfoRate: 0.5,
  lfoDepth: 500,
  lfoWave: "sine",
  lfoTempoMode: false,
  lfoStep: 4
};
let currentParams = { ...defaultParams };

const stepMap = [
  { mult: 0.25 }, { mult: 1/3 }, { mult: 0.5 }, { mult: 2/3 },
  { mult: 1 }, { mult: 1.5 }, { mult: 2 }, { mult: 4 }
];

function disablePreservePitch(el) {
  try {
    el.preservesPitch = false;
    el.webkitPreservesPitch = false;
    el.mozPreservesPitch = false;
  } catch {}
}

function applyPitch(p) {
  // p is in half-semitones; 24 half-semitones = 1 octave
  const rate = Math.pow(2, p / 24);
  document.querySelectorAll("audio,video").forEach(el => {
    disablePreservePitch(el);
    el.playbackRate = rate;
  });
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function loadImpulse(type) {
  if (!audioCtx) return;
  if (type === loadedImpulse || impulseLoading) return;

  impulseLoading = true;
  try {
    let buf;
    if (type.startsWith("custom:")) {
      // User-imported IR, persisted in chrome.storage.local by the popup —
      // not a bundled asset, so no fetch() against the extension package.
      const key = `customIR:${type.slice("custom:".length)}`;
      const result = await chrome.storage.local.get(key);
      const entry = result[key];
      if (!entry) throw new Error(`Custom IR "${type}" not found in storage`);
      buf = base64ToArrayBuffer(entry.dataBase64);
    } else {
      const resp = await fetch(chrome.runtime.getURL(`impulse/${type}.wav`));
      buf = await resp.arrayBuffer();
    }
    const decoded = await audioCtx.decodeAudioData(buf);
    reverbNode.buffer = decoded;
    loadedImpulse = type;
  } catch (e) {
    console.warn("IR load failed", e);
  }
  impulseLoading = false;
}

// bars as multiples of a whole note; rate = bpm/60/4 * (1/bars)
const lfoStepMap = [
  { name: "16 bars", bars: 16 },
  { name: "8 bars",  bars: 8 },
  { name: "4 bars",  bars: 4 },
  { name: "2 bars",  bars: 2 },
  { name: "1 bar",   bars: 1 },
  { name: "1/2 bar", bars: 0.5 },
  { name: "1/4 bar", bars: 0.25 },
];

function resolveRate(params) {
  if (params.lfoTempoMode) {
    const beatsPerSec = params.bpm / 60;
    const bars = lfoStepMap[params.lfoStep]?.bars ?? 1;
    return beatsPerSec / (bars * 4); // 4 beats per bar
  }
  return params.lfoRate;
}


function startLfo() {
  if (!audioCtx || lfoNode) return;
  lfoNode = audioCtx.createOscillator();
  lfoDepthNode = audioCtx.createGain();
  lfoNode.type = currentParams.lfoWave;
  lfoNode.frequency.value = resolveRate(currentParams);
  lfoDepthNode.gain.value = currentParams.lfoDepth;
  lfoNode.connect(lfoDepthNode);
  lfoDepthNode.connect(filterNode.frequency);
  lfoNode.start();
}

function stopLfo() {
  if (!lfoNode) return;
  try { lfoNode.stop(); } catch {}
  lfoNode.disconnect();
  lfoDepthNode.disconnect();
  lfoNode = null;
  lfoDepthNode = null;
}

function updateLfo() {
  if (!audioCtx) return;
  if (currentParams.lfoOn) {
    if (!lfoNode) startLfo();
    lfoNode.frequency.value = resolveRate(currentParams);
    lfoNode.type = currentParams.lfoWave;
    lfoDepthNode.gain.value = currentParams.lfoDepth;
  } else {
    stopLfo();
  }
}


function calcMakeupGain(params) {
  // Bandpass attenuates most signal — compensate with sqrt(Q) boost.
  // At Q=1 this is unity (1.0). At Q=10 it's ~3.2x. Feels natural.
  // Lowpass/highpass get no compensation — they don't have the same problem.
  if (params.filterType === "bandpass") {
    return Math.sqrt(Math.max(params.filterQ, 1));
  }
  return 1.0;
}

// Split blend: 0-50% holds dry at full and linearly brings wet in underneath
// it (like a pedal "blend" control — wet is added on top, dry never dips).
// 50-100% holds wet at full and linearly fades dry out. Unlike an equal-power
// crossfade, both signals reach unity gain somewhere in the sweep instead of
// being attenuated everywhere except the two extremes, so the effect reads
// as louder/punchier through the whole knob range.
function dryWetMix(m) {
  m = Math.max(0, Math.min(1, m));
  if (m <= 0.5) {
    return { dry: 1, wet: m * 2 };
  }
  return { dry: (1 - m) * 2, wet: 1 };
}

function setupAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  filterNode = audioCtx.createBiquadFilter();
  makeupGainNode = audioCtx.createGain();

  delayNode = audioCtx.createDelay(5);
  feedbackNode = audioCtx.createGain();
  delayDryGain = audioCtx.createGain();
  delayWetGain = audioCtx.createGain();
  delayMixBus = audioCtx.createGain(); // fixed unity gain — summing point feeding stage 2

  reverbNode = audioCtx.createConvolver();
  reverbDryGain = audioCtx.createGain();
  reverbWetGain = audioCtx.createGain();

  filterNode.type = currentParams.filterType;
  filterNode.frequency.value = currentParams.filterFreq;
  filterNode.Q.value = currentParams.filterQ;
  makeupGainNode.gain.value = calcMakeupGain(currentParams);

  delayNode.delayTime.value = currentParams.time;
  feedbackNode.gain.value = currentParams.feedback;

  const delayMix = dryWetMix(currentParams.delayMix);
  delayDryGain.gain.value = delayMix.dry;
  delayWetGain.gain.value = delayMix.wet;

  const reverbMix = dryWetMix(currentParams.reverbMix);
  reverbDryGain.gain.value = reverbMix.dry;
  reverbWetGain.gain.value = reverbMix.wet;

  loadImpulse(currentParams.reverbType);

  delayNode.connect(feedbackNode);
  feedbackNode.connect(delayNode);

  const els = document.querySelectorAll("audio,video");
  els.forEach(el => {
    try {
      disablePreservePitch(el);
      const src = audioCtx.createMediaElementSource(el);

      // filter → makeup gain → rest of chain
      src.connect(filterNode);
      filterNode.connect(makeupGainNode);

      // stage 1: delay wet/dry crossfade, summed on delayMixBus
      makeupGainNode.connect(delayDryGain);
      delayDryGain.connect(delayMixBus);

      makeupGainNode.connect(delayNode);
      delayNode.connect(delayWetGain);
      delayWetGain.connect(delayMixBus);

      // stage 2: reverb wet/dry crossfade, fed by stage 1's combined output
      delayMixBus.connect(reverbDryGain);
      reverbDryGain.connect(audioCtx.destination);

      delayMixBus.connect(reverbNode);
      reverbNode.connect(reverbWetGain);
      reverbWetGain.connect(audioCtx.destination);

      applyPitch(currentParams.pitch);

    } catch (e) {
      console.warn("Already connected", e);
    }
  });

}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "START_CAPTURE") setupAudio();

  if (msg.type === "UPDATE_PARAMS") {
    Object.assign(currentParams, msg.params);

    applyPitch(currentParams.pitch);

    if (audioCtx) {
      const delayMix = dryWetMix(currentParams.delayMix);
      delayDryGain.gain.value = delayMix.dry;
      delayWetGain.gain.value = delayMix.wet;

      const reverbMix = dryWetMix(currentParams.reverbMix);
      reverbDryGain.gain.value = reverbMix.dry;
      reverbWetGain.gain.value = reverbMix.wet;

      feedbackNode.gain.value = currentParams.feedback;

      filterNode.frequency.value = currentParams.filterFreq;
      filterNode.type = currentParams.filterType;
      filterNode.Q.value = currentParams.filterQ;
      makeupGainNode.gain.value = calcMakeupGain(currentParams);

      updateLfo();

      if (currentParams.tempoMode) {
        const crotchet = 60 / currentParams.bpm;
        delayNode.delayTime.value =
          crotchet * (stepMap[currentParams.step]?.mult || 1);
      } else {
        delayNode.delayTime.value = currentParams.time;
      }

      if (currentParams.reverbType !== loadedImpulse)
        loadImpulse(currentParams.reverbType);
    }
  }

  if (msg.type === "GET_PARAMS") sendResponse({ params: currentParams });
  if (msg.type === "GET_DEFAULTS") sendResponse({ params: defaultParams });

});

chrome.runtime.sendMessage({ type: "CONTENT_READY" });
