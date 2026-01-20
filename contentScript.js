let audioCtx;

let dryNode;
let delayNode;
let delayGain;
let feedbackNode;

let reverbNode;
let reverbGainNode;

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
  reverbType: "church"
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

function setupAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  delayNode = audioCtx.createDelay(5);
  delayGain = audioCtx.createGain();
  feedbackNode = audioCtx.createGain();
  dryNode = audioCtx.createGain();
  reverbNode = audioCtx.createConvolver();
  reverbGainNode = audioCtx.createGain();

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

      // dry
      src.connect(dryNode);
      dryNode.connect(audioCtx.destination);

      // delay
      src.connect(delayNode);
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
