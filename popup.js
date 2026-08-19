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
  const delayMix = document.getElementById("delayMix");
  const delayMixValue = document.getElementById("delayMixValue");
  const feedback = document.getElementById("feedback");
  const feedbackValue = document.getElementById("feedbackValue");
  const timeSlider = document.getElementById("time");
  const timeValue = document.getElementById("timeValue");
  const timeLabel = document.getElementById("timeLabel");
  const tempoMode = document.getElementById("tempoMode");
  const bpmInput = document.getElementById("bpm");
  const pitch = document.getElementById("pitch");
  const pitchValue = document.getElementById("pitchValue");
  const reverbMix = document.getElementById("reverbMix");
  const reverbMixValue = document.getElementById("reverbMixValue");
  const reverbSelect = document.getElementById("reverbSelect");
  const customIrGroup = document.getElementById("customIrGroup");
  const importIrBtn = document.getElementById("importIrBtn");
  const importIrFile = document.getElementById("importIrFile");
  const deleteIrBtn = document.getElementById("deleteIrBtn");
  const customIrStorageValue = document.getElementById("customIrStorageValue");
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

  // Q: 0.5 to 30, log scale, slider 0-1000
  // (below ~0.5-0.7 a biquad is critically/over-damped and produces no
  // audible resonant peak, so that range just wasted slider travel)
  const Q_MIN = 0.5;
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
  const DEPTH_MIN = 0;
  const DEPTH_MAX = 10000;

	function sliderToDepth(val) {
	  return DEPTH_MIN + (DEPTH_MAX - DEPTH_MIN) * (val / 1000);
	}
	function depthToSlider(d) {
	  return Math.round(1000 * (d - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN));
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

  // ---------- CUSTOM IR STORAGE ----------
  // Custom IRs live in chrome.storage.local as { name, dataBase64 } under
  // keys "customIR:<slug>". This is what makes them survive popup close/
  // reopen and browser restarts without any re-picking or re-permissioning.
  const CUSTOM_IR_PREFIX = "customIR:";
  const CUSTOM_IR_WARN_BYTES = 10 * 1024 * 1024; // ~10 wav files at your library's average size

  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function getCustomIrEntries() {
    const all = await chrome.storage.local.get(null);
    const entries = {};
    for (const key in all) {
      if (key.startsWith(CUSTOM_IR_PREFIX)) {
        entries[key.slice(CUSTOM_IR_PREFIX.length)] = all[key];
      }
    }
    return entries;
  }

  function formatBytes(bytes) {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} KB`;
  }

  // Rebuilds the "custom" optgroup from storage and updates the size readout.
  // Called on popup load and after every import, so the list is always in
  // sync with what's actually persisted — nothing to "reconnect".
  async function refreshCustomIrList() {
    const entries = await getCustomIrEntries();
    const slugs = Object.keys(entries);

    if (customIrGroup) {
      customIrGroup.innerHTML = "";
      slugs.forEach(slug => {
        const opt = document.createElement("option");
        opt.value = `custom:${slug}`;
        opt.textContent = entries[slug].name;
        customIrGroup.appendChild(opt);
      });
    }

    if (customIrStorageValue) {
      // dataBase64.length * 0.75 approximates decoded byte size
      const totalBytes = slugs.reduce(
        (sum, slug) => sum + entries[slug].dataBase64.length * 0.75, 0
      );
      customIrStorageValue.textContent = slugs.length
        ? `${slugs.length} custom / ${formatBytes(totalBytes)}`
        : "no custom IRs";
    }

    return entries;
  }

  // DELETE IR only ever acts on custom entries — keep it inert for built-ins
  // rather than requiring the user to notice that themselves.
  function updateDeleteBtnState() {
    if (deleteIrBtn) deleteIrBtn.disabled = !reverbSelect.value.startsWith("custom:");
  }

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
      timeLabel.textContent = "[ TIME: STEP ]";
      timeValue.textContent = stepMap[params.step]?.name ?? "";
    } else {
      timeLabel.textContent = "[ TIME: MS ]";
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
        pitchValue.textContent = `${sign}${semitones % 1 === 0 ? semitones : semitones.toFixed(1)}`;
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

    if (delayMixValue) {
      delayMixValue.textContent = `${Math.round(params.delayMix * 100)}%`;
    }

    if (feedbackValue) {
      feedbackValue.textContent = `${Math.round(params.feedback * 100)}%`;
    }

    if (reverbMixValue) {
      reverbMixValue.textContent = `${Math.round(params.reverbMix * 100)}%`;
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

    delayMix.value = params.delayMix * 100;
    feedback.value = params.feedback * 100;
    pitch.value = params.pitch;
    bpmInput.value = params.bpm;

    timeSlider.value = params.tempoMode
      ? params.step
      : (params.time * 1000);

    reverbMix.value = params.reverbMix * 100;
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
    updateDeleteBtnState();
  }

  // SEND CURRENT UI STATE TO CONTENT SCRIPT
  function sendParams() {

    const bpm = parseFloat(bpmInput.value) || 120;

    const params = {
      delayMix: parseFloat(delayMix.value) / 100,
      feedback: parseFloat(feedback.value) / 100,
      pitch: parseFloat(pitch.value),
      bpm,
      tempoMode: tempoMode.checked,
      step: parseInt(timeSlider.value, 10),
      time: parseFloat(timeSlider.value) / 1000,
      reverbMix: parseFloat(reverbMix.value) / 100,
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
  // Custom IR options must exist in the <select> before updateKnobs() sets
  // reverbSelect.value, or a saved "custom:xyz" selection won't match anything.
  refreshCustomIrList().then(() => {
    sendToContent({ type: "GET_PARAMS" }, (response) => {
      const params = response?.params;
      if (!params) return;

      updateKnobs(params);
      updateLabels(params);
    });
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


  // IMPORT IR — button opens hidden file input
  if (importIrBtn) importIrBtn.addEventListener("click", () => importIrFile && importIrFile.click());

  if (importIrFile) importIrFile.addEventListener("change", async () => {
    const files = Array.from(importIrFile.files || []);
    if (!files.length) return;

    const nonWav = files.filter(f => !f.name.toLowerCase().endsWith(".wav"));
    if (nonWav.length) {
      alert(`Skipping non-.wav file(s): ${nonWav.map(f => f.name).join(", ")}`);
    }
    const wavFiles = files.filter(f => f.name.toLowerCase().endsWith(".wav"));
    if (!wavFiles.length) { importIrFile.value = ""; return; }

    const existing = await getCustomIrEntries();
    const existingBytes = Object.values(existing).reduce(
      (sum, e) => sum + e.dataBase64.length * 0.75, 0
    );
    const incomingBytes = wavFiles.reduce((sum, f) => sum + f.size, 0);
    const totalBytes = existingBytes + incomingBytes;

    if (totalBytes > CUSTOM_IR_WARN_BYTES) {
      const proceed = confirm(
        `This will bring your custom IR storage to ~${formatBytes(totalBytes)}, ` +
        `stored inside the browser on this device. It won't sync to other machines ` +
        `and can add to your browser's profile size. Continue importing?`
      );
      if (!proceed) { importIrFile.value = ""; return; }
    }

    for (const file of wavFiles) {
      const buf = await file.arrayBuffer();
      const dataBase64 = arrayBufferToBase64(buf);
      const slug = file.name
        .replace(/\.wav$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `ir-${Date.now()}`;
      await chrome.storage.local.set({
        [`${CUSTOM_IR_PREFIX}${slug}`]: {
          name: file.name.replace(/\.wav$/i, ""),
          dataBase64
        }
      });
    }

    await refreshCustomIrList();
    importIrFile.value = "";
  });

  // DELETE IR — removes the selected custom entry from storage; no-ops for built-ins
  if (deleteIrBtn) deleteIrBtn.addEventListener("click", async () => {
    const current = reverbSelect.value;
    if (!current.startsWith("custom:")) return;

    const label = reverbSelect.options[reverbSelect.selectedIndex]?.textContent || current;
    if (!confirm(`Delete custom IR "${label}"? This can't be undone.`)) return;

    const slug = current.slice("custom:".length);
    await chrome.storage.local.remove(`${CUSTOM_IR_PREFIX}${slug}`);
    await refreshCustomIrList();

    // the deleted IR is no longer a valid selection — fall back to a built-in
    reverbSelect.value = "church";
    updateDeleteBtnState();
    sendParams();
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

  reverbSelect.addEventListener("input", updateDeleteBtnState);

  // LISTEN TO ALL OTHER CONTROLS
  [
    delayMix, feedback, pitch, reverbMix, reverbSelect,
    filterFreq, filterQ, filterType,
    lfoRate, lfoStep, lfoDepth, lfoWave,
    timeSlider, bpmInput
  ].forEach(el =>
    el.addEventListener("input", () => {
      sendParams();
    })
  );

});
