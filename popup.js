document.addEventListener("DOMContentLoaded", () => {

  function sendToContent(msg, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg, callback);
      }
    });
  }

  // Start audio engine in the tab
  sendToContent({ type: "START_CAPTURE" });

  // ---------- DOM REFERENCES ----------
  const dry = document.getElementById("dry");
  const level = document.getElementById("level");
  const feedback = document.getElementById("feedback");
  const timeSlider = document.getElementById("time");
  const timeValue = document.getElementById("timeValue");
  const timeLabel = document.getElementById("timeLabel");
  const tempoMode = document.getElementById("tempoMode");
  const bpmInput = document.getElementById("bpm");
  const pitch = document.getElementById("pitch");
  const pitchValue = document.getElementById("pitchValue");
  const reverb = document.getElementById("reverb");
  const reverbSelect = document.getElementById("reverbSelect");
  const resetBtn = document.getElementById("resetBtn");

  // ---------- STEP MAP ----------
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

  // UPDATE SLIDER MODE — MIN/MAX/STEP
  function updateSliderMode() {
    if (tempoMode.checked) {
      timeSlider.min = 0;
      timeSlider.max = stepMap.length - 1;
      timeSlider.step = 1;
    } else {
      timeSlider.min = 1;
      timeSlider.max = 2000;
      timeSlider.step = 1;
    }
  }

  // UPDATE LABELS / READOUTS
  function updateLabels(params) {

    if (tempoMode.checked) {
      timeLabel.textContent = "[ DELAY TIME: STEP ]";
      timeValue.textContent = stepMap[params.step]?.name ?? "";
    } else {
      timeLabel.textContent = "[ DELAY TIME: MS ]";
      timeValue.textContent = `${params.time * 1000} ms`;
    }

    if (pitchValue) {
      pitchValue.textContent = params.pitch;
    }
  }

  // UPDATE ALL UI KNOBS FROM A PARAMS OBJECT
  function updateKnobs(params) {

    tempoMode.checked = params.tempoMode;

    updateSliderMode();

    dry.value = params.dry * 100;
    level.value = params.level * 100;
    feedback.value = params.feedback * 100;
    pitch.value = params.pitch;
    bpmInput.value = params.bpm;

    timeSlider.value = params.tempoMode
      ? params.step
      : (params.time * 1000);

    reverb.value = params.reverbGain * 100;
    reverbSelect.value = params.reverbType;
  }

  // SEND CURRENT UI STATE TO CONTENT SCRIPT
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
    updateLabels(params);
  }

  // INIT FROM CONTENT SCRIPT
  sendToContent({ type: "GET_PARAMS" }, (response) => {
    const params = response?.params;
    if (!params) return;

    updateKnobs(params);
    updateLabels(params);
  });

  // LISTEN TO RESET BUTTON
  resetBtn.addEventListener("click", () => {
    sendToContent({ type: "GET_DEFAULTS" }, (response) => {
      const params = response?.params;
      if (!params) return;

      updateKnobs(params);
      updateLabels(params);
      sendParams();
    });
  });

  // LISTEN TO TEMPO TOGGLE
  tempoMode.addEventListener("input", () => {
    updateSliderMode();
    sendParams();
  });

  // LISTEN TO ALL OTHER CONTROLS
  [
    dry, level, feedback, pitch, reverb, reverbSelect,
    timeSlider, bpmInput
  ].forEach(el =>
    el.addEventListener("input", () => {
      sendParams();
    })
  );

});
