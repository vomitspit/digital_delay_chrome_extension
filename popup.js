document.addEventListener("DOMContentLoaded", () => {

  function sendToContent(msg, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg, callback);
    });
  }

  // Startup message
  sendToContent({ type: "START_CAPTURE" });

  // DOM refs
  const dry = document.getElementById("dry");
  const level = document.getElementById("level");
  const feedback = document.getElementById("feedback");
  const timeSlider = document.getElementById("time");
  const timeValue = document.getElementById("timeValue");
  const timeLabel = document.getElementById("timeLabel");
  const tempoMode = document.getElementById("tempoMode");
  const bpmInput = document.getElementById("bpm");
  const pitch = document.getElementById("pitch");
  const reverb = document.getElementById("reverb");
  const reverbSelect = document.getElementById("reverbSelect");

  const stepMap = [
    { name: "1/16", mult: 0.25 },
    { name: "1/8T", mult: 1 / 3 },
    { name: "1/8", mult: 0.5 },
    { name: "1/4T", mult: 2 / 3 },
    { name: "1/4", mult: 1 },
    { name: "1/4 dotted", mult: 1.5 },
    { name: "1/2", mult: 2 },
    { name: "1/1", mult: 4 }
  ];

  function updateSliderMode(send = true) {
    if (tempoMode.checked) {
      timeSlider.min = 0;
      timeSlider.max = stepMap.length - 1;
      timeSlider.step = 1;
    } else {
      timeSlider.min = 1;
      timeSlider.max = 2000;
      timeSlider.step = 1;
    }
    if (send) sendParams();
  }

  function sendParams() {
    const bpm = parseFloat(bpmInput.value) || 120;

    const params = {
      dry: parseFloat(dry.value) / 100,
      level: parseFloat(level.value) / 100,
      feedback: parseFloat(feedback.value) / 100,
      pitch: parseFloat(pitch.value),
      bpm,
      tempoMode: tempoMode.checked,
      step: parseInt(timeSlider.value, 10),
      time: parseFloat(timeSlider.value) / 1000,
      reverbGain: parseFloat(reverb.value) / 100,
      reverbType: reverbSelect.value
    };

    sendToContent({ type: "UPDATE_PARAMS", params });

    if (tempoMode.checked) {
      timeLabel.textContent = "[ DELAY TIME: STEP ]";
      timeValue.textContent = stepMap[params.step]?.name ?? "";
    } else {
      timeLabel.textContent = "[ DELAY TIME: MS ]";
      timeValue.textContent = `${timeSlider.value} ms`;
    }
  }

  // Listen to all controls
  [
    dry, level, feedback, pitch, reverb, reverbSelect,
    timeSlider, bpmInput, tempoMode
  ].forEach(el =>
    el.addEventListener("input", () => {
      if (el === tempoMode) updateSliderMode();
      else sendParams();
    })
  );

  // Load stored params
  sendToContent({ type: "GET_PARAMS" }, (response) => {
    const params = response?.params || {};

    dry.value = (params.dry ?? 1) * 100;
    level.value = (params.level ?? 0.5) * 100;
    feedback.value = (params.feedback ?? 0.6) * 100;
    pitch.value = params.pitch ?? 0;
    bpmInput.value = params.bpm ?? 120;
    tempoMode.checked = params.tempoMode ?? true;
    timeSlider.value = params.tempoMode ? (params.step ?? 1) : (params.time * 1000);
    reverb.value = (params.reverbGain ?? 0.3) * 100;
    reverbSelect.value = params.reverbType ?? "hall";

    updateSliderMode(false);
    sendParams();
  });

});
