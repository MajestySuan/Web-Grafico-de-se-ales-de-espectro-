const form = document.getElementById('paramsForm');
const ctx = document.getElementById('spectrumChart').getContext('2d');
const measurementsDiv = document.getElementById('measurements');
let chart;

document.getElementById('resetZoomBtn').addEventListener('click', () => {
  if (chart) chart.resetZoom();
});

document.querySelector('nav a[role="button"]').addEventListener('click', () => {
  document.getElementById('creadoresModal').showModal();
});

function dbmToWatts(dbm) {
  return Math.pow(10, dbm / 10) / 1000;
}

function wattsToDbm(watts) {
  return 10 * Math.log10(watts * 1000);
}

function generateNoise(frequencies, avgNoiseWatts) {
  return frequencies.map(() => {
    const variation = (Math.random() - 0.5) * avgNoiseWatts * 0.2; // +/- 20%
    return avgNoiseWatts + variation;
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const data = new FormData(form);
  const T = parseFloat(data.get('temp')); // Kelvin
  const bw = parseFloat(data.get('bw'));
  const noiseSystem = parseFloat(data.get('noiseSystem') || '0'); // dBm

  const k = 1.380649e-23;
  const noiseWattsAvg = k * T * bw;
  const noiseDbm = 10 * Math.log10(noiseWattsAvg * 1000) + noiseSystem;

  const signals = [];
  for (let i = 1; i <= 3; i++) {
    signals.push({
      power: dbmToWatts(parseFloat(data.get(`power${i}`))),
      bw: parseFloat(data.get(`bw${i}`)),
      fc: parseFloat(data.get(`fc${i}`)),
      name: `Señal ${i}`
    });
  }

  const minF = Math.min(...signals.map(s => s.fc - s.bw / 2)) - 10e6;
  const maxF = Math.max(...signals.map(s => s.fc + s.bw / 2)) + 10e6;
  const freq = [];
  const step = (maxF - minF) / 1000;
  for (let f = minF; f <= maxF; f += step) freq.push(f);

  const noise = generateNoise(freq, noiseWattsAvg);
  const total = noise.slice();

  const signalCurves = signals.map((sig, index) => {
    const curve = freq.map((f, i) => {
      const delta = Math.abs(f - sig.fc);
      if (delta <= sig.bw / 2) {
        const contribution = sig.power / (sig.bw / step);
        total[i] += contribution;
        return contribution;
      } else if (Math.abs(delta - sig.bw / 2) < step) {
        return sig.power / (sig.bw / step) / 2;
      } else {
        return 0;
      }
    });

    return {
      label: sig.name,
      data: curve.map(wattsToDbm),
      borderColor: ['red', 'green', 'orange'][index],
      fill: false
    };
  });

 
  const snrLines = signals.map((sig, idx) => {
    const noisePowerW = k * T * sig.bw;
    const snrLinear = sig.power / noisePowerW;
    const snrDb = 10 * Math.log10(snrLinear);
    const noiseDbmBase = 10 * Math.log10(noisePowerW * 1000);

    const snrLine = Array(freq.length).fill(noiseDbmBase + snrDb);

    return {
      label: `SNR Señal ${idx + 1}`,
      data: snrLine,
      borderColor: ['magenta', 'cyan', 'yellow'][idx],
      borderDash: [10, 5],
      fill: false,
      pointRadius: 0
    };
  });

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: freq.map(f => (f / 1e6).toFixed(2)), // MHz
      datasets: [
        {
          label: 'Ruido térmico',
          data: noise.map(wattsToDbm),
          borderColor: 'gray',
          borderDash: [5, 5],
          fill: false
        },
        ...signalCurves,
        {
          label: 'Total (Señales + Ruido)',
          data: total.map(wattsToDbm),
          borderColor: 'blue',
          fill: false
        },
        ...snrLines 
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Frecuencia (MHz)'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Potencia (dBm)'
          }
        }
      },
      plugins: {
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy',
            modifierKey: 'ctrl'
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            mode: 'xy'
          }
        }
      }
    }
  });

  let diffText = '<strong>Diferencias entre señales (dB):</strong><br>';
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const diff = Math.abs(wattsToDbm(signals[i].power) - wattsToDbm(signals[j].power)).toFixed(2);
      diffText += `Señal ${i + 1} vs Señal ${j + 1}: ${diff} dB<br>`;
    }
  }


  let snrText = '<strong>SNR (dB):</strong><br>';
  signals.forEach((sig, idx) => {
    const signalPowerW = sig.power;
    const noisePowerW = k * T * sig.bw;
    const snrLinear = signalPowerW / noisePowerW;
    const snrDb = 10 * Math.log10(snrLinear);
    snrText += `Señal ${idx + 1}: ${snrDb.toFixed(2)} dB<br>`;
  });

  measurementsDiv.innerHTML = diffText + '<br>' + snrText;
});
