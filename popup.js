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
  const filterFreq = document.getElementById("filterFreq");
  const filterFreqValue = document.getElementById("filterFreqValue");
  const filterQ = document.getElementById("filterQ");
  const filterQValue = document.getElementById("filterQValue");
  const filterType = document.getElementById("filterType");
  const lfoOn = document.getElementById("lfoOn");
  const lfoParams = document.getElementById("lfoParams");
  const lfoTempoMode = document.getElementById("lfoTempoMode");
  const lfoRate = document.getElementById("lfoRate");
  const lfoRateValue = document.getElementById("lfoRateValue");
  const lfoRateCtrl = document.getElementById("lfoRateCtrl");
  const lfoStep = document.getElementById("lfoStep");
  const lfoStepValue = document.getElementById("lfoStepValue");
  const lfoStepCtrl = document.getElementById("lfoStepCtrl");
  const lfoDepth = document.getElementById("lfoDepth");
  const lfoDepthValue = document.getElementById("lfoDepthValue");
  const lfoWave = document.getElementById("lfoWave");
  const resetBtn = document.getElementById("resetBtn");
  const saveBtn = document.getElementById("saveBtn");
  const loadBtn = document.getElementById("loadBtn");
  const loadFile = document.getElementById("loadFile");

  // ---------- FILTER LOG SCALE ----------
  // Slider is 0-1000 (integer steps). Convert to/from Hz logarithmically.
  const FILTER_MIN = 20;
  const FILTER_MAX = 20000;

  function sliderToHz(val) {
    return FILTER_MIN * Math.pow(FILTER_MAX / FILTER_MIN, val / 1000);
  }

  function hzToSlider(hz) {
    return Math.round(1000 * Math.log(hz / FILTER_MIN) / Math.log(FILTER_MAX / FILTER_MIN));
  }

  // Q: 0.0001 to 30, log scale, slider 0-1000
  const Q_MIN = 0.0001;
  const Q_MAX = 30;

  function sliderToQ(val) {
    return Q_MIN * Math.pow(Q_MAX / Q_MIN, val / 1000);
  }

  function qToSlider(q) {
    return Math.round(1000 * Math.log(q / Q_MIN) / Math.log(Q_MAX / Q_MIN));
  }

  // LFO rate: 0.01 to 20 Hz, log scale, slider 0-1000
  const RATE_MIN = 0.01;
  const RATE_MAX = 20;
  function sliderToRate(val) {
    return RATE_MIN * Math.pow(RATE_MAX / RATE_MIN, val / 1000);
  }
  function rateToSlider(r) {
    return Math.round(1000 * Math.log(r / RATE_MIN) / Math.log(RATE_MAX / RATE_MIN));
  }

  // LFO depth: 1 to 10000 Hz, log scale, slider 0-1000
  const DEPTH_MIN = 1;
  const DEPTH_MAX = 10000;
  function sliderToDepth(val) {
    return DEPTH_MIN * Math.pow(DEPTH_MAX / DEPTH_MIN, val / 1000);
  }
  function depthToSlider(d) {
    return Math.round(1000 * Math.log(d / DEPTH_MIN) / Math.log(DEPTH_MAX / DEPTH_MIN));
  }

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

  const lfoStepMap = [
    { name: "16 bars" },
    { name: "8 bars"  },
    { name: "4 bars"  },
    { name: "2 bars"  },
    { name: "1 bar"   },
    { name: "1/2 bar" },
    { name: "1/4 bar" },
  ];

  function updateLfoVisibility() {
    lfoParams.style.display = lfoOn.checked ? "block" : "none";
    const tempoLocked = lfoTempoMode.checked;
    lfoRateCtrl.style.display = tempoLocked ? "none" : "";
    lfoStepCtrl.style.display = tempoLocked ? "" : "none";
  }

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
      const p = params.pitch;
      if (p === 0) {
        pitchValue.textContent = "0";
      } else {
        const semitones = p / 2;
        const sign = p > 0 ? "+" : "";
        // Show as whole semitone or .5
        pitchValue.textContent = `${sign}${semitones % 1 === 0 ? semitones : semitones.toFixed(1)} st`;
      }
    }

    if (filterFreqValue) {
      const hz = params.filterFreq;
      filterFreqValue.textContent = hz >= 1000
        ? `${(hz / 1000).toFixed(1)} kHz`
        : `${Math.round(hz)} Hz`;
    }

    if (filterQValue) {
      filterQValue.textContent = params.filterQ.toFixed(2);
    }

    if (lfoRateValue) {
      if (params.lfoTempoMode) {
        lfoRateValue.textContent = lfoStepMap[params.lfoStep]?.name ?? "";
      } else {
        lfoRateValue.textContent = `${params.lfoRate.toFixed(2)} Hz`;
      }
    }

    if (lfoStepValue) {
      lfoStepValue.textContent = lfoStepMap[params.lfoStep]?.name ?? "";
    }

	if (lfoDepthValue) {
	  lfoDepthValue.textContent = `${Math.round(params.lfoDepth / 100)}%`;
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
    filterFreq.value = hzToSlider(params.filterFreq);
    filterQ.value = qToSlider(params.filterQ);
    filterType.value = params.filterType;
    lfoOn.checked = params.lfoOn;
    lfoTempoMode.checked = params.lfoTempoMode;
    lfoRate.value = rateToSlider(params.lfoRate);
    lfoStep.value = params.lfoStep;
    lfoDepth.value = depthToSlider(params.lfoDepth);
    lfoWave.value = params.lfoWave;
    updateLfoVisibility();
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
      reverbType: reverbSelect.value,
      filterFreq: sliderToHz(parseFloat(filterFreq.value)),
      filterQ: sliderToQ(parseFloat(filterQ.value)),
      filterType: filterType.value,
      lfoOn: lfoOn.checked,
      lfoTempoMode: lfoTempoMode.checked,
      lfoRate: sliderToRate(parseFloat(lfoRate.value)),
      lfoStep: parseInt(lfoStep.value, 10),
      lfoDepth: sliderToDepth(parseFloat(lfoDepth.value)),
      lfoWave: lfoWave.value
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

  // SAVE
  if (saveBtn) saveBtn.addEventListener("click", () => {
    sendToContent({ type: "GET_PARAMS" }, (response) => {
      const params = response?.params;
      if (!params) return;
      const name = prompt("Save preset as:", "preset");
      if (!name) return;
      const blob = new Blob([JSON.stringify(params, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });

  // LOAD — button opens hidden file input
  if (loadBtn) loadBtn.addEventListener("click", () => loadFile && loadFile.click());

  if (loadFile) loadFile.addEventListener("change", () => {
    const file = loadFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const params = JSON.parse(e.target.result);
        updateKnobs(params);
        updateLabels(params);
        sendParams();
      } catch {
        alert("Couldn't read that file — is it a valid preset JSON?");
      }
    };
    reader.readAsText(file);
    loadFile.value = "";
  });


  tempoMode.addEventListener("input", () => {
    updateSliderMode();
    sendParams();
  });

  // LFO ON toggle — show/hide params then send
  lfoOn.addEventListener("input", () => {
    updateLfoVisibility();
    sendParams();
  });

  // LFO TEMPO-LOCK toggle — swap rate/step visibility then send
  lfoTempoMode.addEventListener("input", () => {
    updateLfoVisibility();
    sendParams();
  });

  // LISTEN TO ALL OTHER CONTROLS
  [
    dry, level, feedback, pitch, reverb, reverbSelect,
    filterFreq, filterQ, filterType,
    lfoRate, lfoStep, lfoDepth, lfoWave,
    timeSlider, bpmInput
  ].forEach(el =>
    el.addEventListener("input", () => {
      sendParams();
    })
  );

});
