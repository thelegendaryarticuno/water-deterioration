// ---- Tab Switching ----
const tabButtons = document.querySelectorAll('.tab-button');
const tabs = {
  brisbane: document.getElementById('tab-brisbane'),
  nyc: document.getElementById('tab-nyc')
};

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(tabs).forEach(t => t.classList.remove('active'));
    const key = btn.dataset.tab;
    tabs[key].classList.add('active');
  });
});

// ---- Brisbane Logic ----
const brisbaneFileInput = document.getElementById('brisbane-file');
const brisbanePredictBtn = document.getElementById('brisbane-predict');
const brisbaneBatchBtn = document.getElementById('brisbane-batch-download');
const brisbanePreviewEl = document.getElementById('brisbane-preview');
const brisbaneProbEl = document.getElementById('brisbane-prob');
const brisbaneLabelEl = document.getElementById('brisbane-label');
const brisbaneThrEl = document.getElementById('brisbane-threshold');
const brisbaneErrEl = document.getElementById('brisbane-error');

const REQUIRED_BRISBANE = [
  'Timestamp', 'Average Water Speed', 'Average Water Direction',
  'Chlorophyll', 'Temperature', 'Dissolved Oxygen',
  'Dissolved Oxygen (%Saturation)', 'pH', 'Salinity',
  'Specific Conductance', 'Turbidity'
];

let brisbaneCsvData = [];

brisbaneFileInput.addEventListener('change', () => {
  brisbaneErrEl.textContent = '';
  brisbanePreviewEl.textContent = '';
  const file = brisbaneFileInput.files[0];
  if (!file) return;
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: (results) => {
      brisbaneCsvData = results.data;
      // show last 10 rows preview limited columns
      const previewRows = brisbaneCsvData.slice(-10);
      const cols = Object.keys(previewRows[0] || {});
      const headerLine = cols.join(',');
      const lines = previewRows.map(r => cols.map(c => r[c]).join(','));
      brisbanePreviewEl.textContent = [headerLine, ...lines].join('\n');
      // basic validation
      const missing = REQUIRED_BRISBANE.filter(c => !cols.includes(c));
      if (missing.length) {
        brisbaneErrEl.textContent = 'Missing required columns: ' + missing.join(', ');
      }
    },
    error: (err) => {
      brisbaneErrEl.textContent = 'CSV parse error: ' + err.message;
    }
  });
});

brisbanePredictBtn.addEventListener('click', async () => {
  brisbaneErrEl.textContent = '';
  if (!brisbaneCsvData.length) {
    brisbaneErrEl.textContent = 'Please upload a CSV first.';
    return;
  }
  const cols = Object.keys(brisbaneCsvData[0]);
  const missing = REQUIRED_BRISBANE.filter(c => !cols.includes(c));
  if (missing.length) {
    brisbaneErrEl.textContent = 'Missing required columns: ' + missing.join(', ');
    return;
  }

  const records = brisbaneCsvData.map(r => ({
    Timestamp: r['Timestamp'],
    Average_Water_Speed: r['Average Water Speed'],
    Average_Water_Direction: r['Average Water Direction'],
    Chlorophyll: r['Chlorophyll'],
    Temperature: r['Temperature'],
    Dissolved_Oxygen: r['Dissolved Oxygen'],
    Dissolved_Oxygen_Saturation: r['Dissolved Oxygen (%Saturation)'],
    pH: r['pH'],
    Salinity: r['Salinity'],
    Specific_Conductance: r['Specific Conductance'],
    Turbidity: r['Turbidity']
  }));

  try {
    brisbanePredictBtn.disabled = true;
    brisbanePredictBtn.textContent = 'Predicting...';
    const resp = await fetch('/predict/brisbane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const prob = data.probability_deterioration_soon;
    const thr = data.threshold_used;
    const label = data.risk_label;
    brisbaneProbEl.textContent = (prob * 100).toFixed(2) + '%';
    brisbaneThrEl.textContent = 'Threshold used: ' + thr.toFixed(2);
    brisbaneLabelEl.textContent = label === 1 ? '⚠️ High Risk' : '✅ Low Risk';
  } catch (e) {
    brisbaneErrEl.textContent = 'Prediction error: ' + e.message;
  } finally {
    brisbanePredictBtn.disabled = false;
    brisbanePredictBtn.textContent = 'Predict Latest Row';
  }
});

// Predict full CSV and download results
brisbaneBatchBtn.addEventListener('click', async () => {
  brisbaneErrEl.textContent = '';
  if (!brisbaneCsvData.length) {
    brisbaneErrEl.textContent = 'Please upload a CSV first.';
    return;
  }
  const cols = Object.keys(brisbaneCsvData[0]);
  const missing = REQUIRED_BRISBANE.filter(c => !cols.includes(c));
  if (missing.length) {
    brisbaneErrEl.textContent = 'Missing required columns: ' + missing.join(', ');
    return;
  }
  const records = brisbaneCsvData.map(r => ({
    Timestamp: r['Timestamp'],
    Average_Water_Speed: r['Average Water Speed'],
    Average_Water_Direction: r['Average Water Direction'],
    Chlorophyll: r['Chlorophyll'],
    Temperature: r['Temperature'],
    Dissolved_Oxygen: r['Dissolved Oxygen'],
    Dissolved_Oxygen_Saturation: r['Dissolved Oxygen (%Saturation)'],
    pH: r['pH'],
    Salinity: r['Salinity'],
    Specific_Conductance: r['Specific Conductance'],
    Turbidity: r['Turbidity']
  }));
  try {
    brisbaneBatchBtn.disabled = true;
    brisbaneBatchBtn.textContent = 'Generating CSV...';
    const resp = await fetch('/predict/brisbane/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, output_format: 'csv' })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brisbane_predictions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    brisbaneErrEl.textContent = 'CSV download error: ' + e.message;
  } finally {
    brisbaneBatchBtn.disabled = false;
    brisbaneBatchBtn.textContent = 'Predict Full CSV & Download';
  }
});

// ---- Brisbane manual single prediction ----
const brManualBtn = document.getElementById('brisbane-manual-predict');
const brManualErr = document.getElementById('brisbane-manual-error');
const brDate = document.getElementById('br-date');
const brTime = document.getElementById('br-time');
const brSpeed = document.getElementById('br-speed');
const brDirection = document.getElementById('br-direction');
const brChl = document.getElementById('br-chl');
const brTemp = document.getElementById('br-temp');
const brDO = document.getElementById('br-do');
const brDOSat = document.getElementById('br-dosat');
const brPH = document.getElementById('br-ph');
const brSal = document.getElementById('br-sal');
const brSC = document.getElementById('br-sc');
const brTurb = document.getElementById('br-turb');

// Default datetime now
const now2 = new Date();
brDate.value = now2.toISOString().slice(0,10);
brTime.value = now2.toTimeString().slice(0,5);

brManualBtn.addEventListener('click', async () => {
  brManualErr.textContent = '';
  const d = brDate.value, t = brTime.value;
  if (!d || !t) { brManualErr.textContent = 'Please provide date and time.'; return; }
  const ts = `${d} ${t}`;
  const record = {
    Timestamp: ts,
    Average_Water_Speed: parseFloat(brSpeed.value),
    Average_Water_Direction: parseFloat(brDirection.value),
    Chlorophyll: parseFloat(brChl.value),
    Temperature: parseFloat(brTemp.value),
    Dissolved_Oxygen: parseFloat(brDO.value),
    Dissolved_Oxygen_Saturation: parseFloat(brDOSat.value),
    pH: parseFloat(brPH.value),
    Salinity: parseFloat(brSal.value),
    Specific_Conductance: parseFloat(brSC.value),
    Turbidity: parseFloat(brTurb.value)
  };
  // basic validation: ensure at least some core vars are provided
  const coreFields = ['Dissolved_Oxygen','Turbidity','pH','Salinity','Temperature','Specific_Conductance','Chlorophyll'];
  const missingCore = coreFields.filter(k => Number.isNaN(record[k.replace(/ /g,'_')]) && record[k] === undefined);
  // Instead map original names directly from object keys (constructed above)
  const numericProvided = ['Dissolved_Oxygen','Turbidity','pH','Salinity','Temperature','Specific_Conductance','Chlorophyll']
    .map(n => record[n.replace(/ /g,'_')]).filter(v => !Number.isNaN(v)).length;
  if (numericProvided === 0) {
    brManualErr.textContent = 'Please enter at least one water quality numeric value.';
    return;
  }
  try {
    brManualBtn.disabled = true;
    brManualBtn.textContent = 'Predicting...';
    const resp = await fetch('/predict/brisbane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [record] })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const prob = data.probability_deterioration_soon;
    const thr = data.threshold_used;
    const label = data.risk_label;
    brisbaneProbEl.textContent = (prob * 100).toFixed(2) + '%';
    brisbaneThrEl.textContent = 'Threshold used: ' + thr.toFixed(2);
    brisbaneLabelEl.textContent = label === 1 ? '⚠️ High Risk' : '✅ Low Risk';
  } catch (e) {
    brManualErr.textContent = 'Prediction error: ' + e.message;
    console.error('Manual Brisbane prediction error', e);
  } finally {
    brManualBtn.disabled = false;
    brManualBtn.textContent = 'Predict Single Reading';
  }
});
// ---- NYC Logic ----
const nycPredictBtn = document.getElementById('nyc-predict');
const nycProbEl = document.getElementById('nyc-prob');
const nycThrEl = document.getElementById('nyc-threshold');
const nycLabelEl = document.getElementById('nyc-label');
const nycErrEl = document.getElementById('nyc-error');
const nycChlorine = document.getElementById('nyc-chlorine');
const nycTurbidity = document.getElementById('nyc-turbidity');

// Set default date/time to now
const nycDateInput = document.getElementById('nyc-date');
const nycTimeInput = document.getElementById('nyc-time');
const now = new Date();
nycDateInput.value = now.toISOString().slice(0, 10);
nycTimeInput.value = now.toTimeString().slice(0,5);

nycPredictBtn.addEventListener('click', async () => {
  nycErrEl.textContent = '';
  const sample_date = nycDateInput.value; // yyyy-mm-dd
  const sample_time = nycTimeInput.value; // HH:MM
  const sample_class = document.getElementById('nyc-class').value;
  const chlorine = parseFloat(document.getElementById('nyc-chlorine').value);
  const turbidity = parseFloat(document.getElementById('nyc-turbidity').value);
  if (!sample_date || !sample_time) {
    nycErrEl.textContent = 'Please provide date and time.';
    return;
  }
  try {
    nycPredictBtn.disabled = true;
    nycPredictBtn.textContent = 'Predicting...';
    const resp = await fetch('/predict/nyc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        samples: [
          {
            Sample_Date: sample_date,
            Sample_Time: sample_time,
            Sample_class: sample_class,
            Residual_Free_Chlorine_mg_L: chlorine,
            Turbidity_NTU: turbidity
          }
        ]
      })
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const p = data.probability_failure[0];
    const label = data.risk_labels[0];
    const thr = data.threshold_used;
    nycProbEl.textContent = (p * 100).toFixed(2) + '%';
    nycThrEl.textContent = 'Threshold used: ' + thr.toFixed(2);
    nycLabelEl.textContent = label === 1 ? '⚠️ Sample at elevated risk of microbiological failure' : '✅ Sample appears within normal risk range';
  } catch (e) {
    nycErrEl.textContent = 'Prediction error: ' + e.message;
  } finally {
    nycPredictBtn.disabled = false;
    nycPredictBtn.textContent = 'Predict Failure Risk';
  }
});

// ---- Dynamic coloring for NYC inputs ----
function colorNYCInput(inp) {
  if (!inp) return;
  inp.classList.remove('ok','warn','bad');
  const v = parseFloat(inp.value);
  if (Number.isNaN(v)) return;
  if (inp.id === 'nyc-chlorine') {
    // good 0.2-1.0, warn 0.1-2.0 else bad
    if (v >= 0.2 && v <= 1.0) inp.classList.add('ok');
    else if (v >= 0.1 && v <= 2.0) inp.classList.add('warn');
    else inp.classList.add('bad');
  } else if (inp.id === 'nyc-turbidity') {
    // good 0-0.3, warn 0.3-1.0, else bad
    if (v >= 0 && v <= 0.3) inp.classList.add('ok');
    else if (v > 0.3 && v <= 1.0) inp.classList.add('warn');
    else inp.classList.add('bad');
  }
}
if (nycChlorine) {
  nycChlorine.addEventListener('input', () => colorNYCInput(nycChlorine));
  colorNYCInput(nycChlorine);
}
if (nycTurbidity) {
  nycTurbidity.addEventListener('input', () => colorNYCInput(nycTurbidity));
  colorNYCInput(nycTurbidity);
}

// ---- Glossary Modal ----
const glossaryModal = document.getElementById('glossary-modal');
const openGlossaryBtn = document.getElementById('open-glossary');
const openGlossaryNYCBtn = document.getElementById('open-glossary-nyc');
const closeGlossaryBtn = document.getElementById('close-glossary');
if (openGlossaryBtn) openGlossaryBtn.addEventListener('click', () => glossaryModal.classList.remove('hidden'));
if (openGlossaryNYCBtn) openGlossaryNYCBtn.addEventListener('click', () => glossaryModal.classList.remove('hidden'));
if (closeGlossaryBtn) closeGlossaryBtn.addEventListener('click', () => glossaryModal.classList.add('hidden'));
if (glossaryModal) glossaryModal.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
    glossaryModal.classList.add('hidden');
  }
});

// ---- Dynamic range-based coloring for Brisbane manual inputs ----
const RANGE_BY_ID = {
  'br-temp': { good: [15, 30], warn: [10, 35] },
  'br-ph': { good: [6.5, 8.5], warn: [6.0, 9.0] },
  'br-sc': { good: [50, 2000], warn: [30, 2500] },
  'br-turb': { good: [0, 5], warn: [0, 50] },
  'br-do': { good: [6, 12], warn: [4, 14] },
  'br-dosat': { good: [80, 120], warn: [70, 130] },
  'br-chl': { good: [0, 30], warn: [0, 60] },
  'br-sal': { good: [0, 35], warn: [0, 40] },
  'br-speed': { good: [0, 2], warn: [0, 5] },
  'br-direction': { good: [0, 360], warn: [0, 360] }
};

function applyDynamicStateById(input) {
  if (!input) return;
  input.classList.remove('ok', 'warn', 'bad');
  const ranges = RANGE_BY_ID[input.id];
  if (!ranges) return;
  const v = parseFloat(input.value);
  if (Number.isNaN(v)) return;
  const { good, warn } = ranges;
  let cls = 'bad';
  if (v >= good[0] && v <= good[1]) cls = 'ok';
  else if (v >= warn[0] && v <= warn[1]) cls = 'warn';
  input.classList.add(cls);
}

// Attach listeners to Brisbane manual inputs (ids start with 'br-')
document.querySelectorAll('#tab-brisbane input[type="number"]').forEach(inp => {
  if (!inp.id || !inp.id.startsWith('br-')) return;
  inp.addEventListener('input', () => applyDynamicStateById(inp));
  // initial paint
  applyDynamicStateById(inp);
});
