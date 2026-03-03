let audioCtx;

let dryNode;
let filterNode;
let delayNode;
let delayGain;
let feedbackNode;

let reverbNode;
let reverbGainNode;

let lfoNode;
let lfoDepthNode;
let makeupGainNode;

let loadedImpulse = null;
let impulseLoading = false;

let defaultParams = {
  dry: 1.0,
  level: 0.5,
  feedback: 0.6,
  pitch: 0,
  bpm: 120,
  tempoMode: true,
  step: 1,
  time: 0.1667,
  reverbGain: 0,
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

async function loadImpulse(type) {
  if (!audioCtx) return;
  if (type === loadedImpulse || impulseLoading) return;

  impulseLoading = true;
  try {
    const resp = await fetch(chrome.runtime.getURL(`impulse/${type}.wav`));
    const buf = await resp.arrayBuffer();
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

function setupAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  delayNode = audioCtx.createDelay(5);
  delayGain = audioCtx.createGain();
  feedbackNode = audioCtx.createGain();
  dryNode = audioCtx.createGain();
  filterNode = audioCtx.createBiquadFilter();
  makeupGainNode = audioCtx.createGain();
  reverbNode = audioCtx.createConvolver();
  reverbGainNode = audioCtx.createGain();

  filterNode.type = currentParams.filterType;
  filterNode.frequency.value = currentParams.filterFreq;
  filterNode.Q.value = currentParams.filterQ;
  makeupGainNode.gain.value = calcMakeupGain(currentParams);

  delayNode.delayTime.value = currentParams.time;
  delayGain.gain.value = currentParams.level;
  feedbackNode.gain.value = currentParams.feedback;
  dryNode.gain.value = currentParams.dry;
  reverbGainNode.gain.value = currentParams.reverbGain;

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

      // dry
      makeupGainNode.connect(dryNode);
      dryNode.connect(audioCtx.destination);

      // delay
      makeupGainNode.connect(delayNode);
      delayNode.connect(delayGain);
      delayGain.connect(audioCtx.destination);

      // reverb (from delay, wet-only)
      delayNode.connect(reverbNode);
      reverbNode.connect(reverbGainNode);
      reverbGainNode.connect(audioCtx.destination);

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
      dryNode.gain.value = currentParams.dry;
      delayGain.gain.value = currentParams.level;
      feedbackNode.gain.value = currentParams.feedback;
      reverbGainNode.gain.value = currentParams.reverbGain;

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
