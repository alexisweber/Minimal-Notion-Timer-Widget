(() => {
  // ----- Elements
  const body = document.body;
  const hhEl = document.getElementById('hh');
  const mmEl = document.getElementById('mm');
  const ssEl = document.getElementById('ss');

  const plus = document.getElementById('plus');
  const minus = document.getElementById('minus');

  const progress = document.getElementById('progress');

  const btnMain = document.getElementById('btnMain');
  const btnReset = document.getElementById('btnReset');
  const btnTheme = document.getElementById('btnTheme');

  // ----- Icons (inline SVG)
  const ICON_PLAY = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l12-7-12-7z"></path>
    </svg>`;
  const ICON_PAUSE = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z"></path>
    </svg>`;
  const ICON_STOP = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 7h10v10H7z"></path>
    </svg>`;

  // ----- State
  let selectedField = 'hh'; // 'hh' | 'mm'
  let totalSeconds = 0;
  let remainingSeconds = 0;
  let isRunning = false;
  let isBeeping = false;
  let tickId = null;
    // requestAnimationFrame id
  let rafId = null; 
  // performance.now() when run starts
  let startPerf = 0;  
  // remaining time (ms) at run start         
  let baseRemainingMs = 0; 
  let lastWholeSec = null; 

  // Keep the "original timer setting" for reset behavior
  let presetSeconds = 0;

  // ----- Ring math
  const R = 80;
  const C = 2 * Math.PI * R;

  function setRingByFractionRemaining(frac){
    // frac: 1 = full remaining, 0 = none remaining
    const dash = Math.max(0, Math.min(1, frac)) * C;
    progress.style.strokeDasharray = `${dash} ${C - dash}`;
  }

  // ----- Formatting
  const pad2 = (n) => String(n).padStart(2,'0');
  function setDisplayFromSeconds(sec){
    const s = Math.max(0, sec|0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    hhEl.textContent = pad2(h);
    mmEl.textContent = pad2(m);
    ssEl.textContent = pad2(r);
  }

  function syncRing(){
    if (totalSeconds <= 0){
      setRingByFractionRemaining(1);
      return;
    }
    setRingByFractionRemaining(remainingSeconds / totalSeconds);
  }

  // ----- Selection UI
  function selectField(field){
    selectedField = field;
    hhEl.classList.toggle('selected', field === 'hh');
    mmEl.classList.toggle('selected', field === 'mm');
  }
  hhEl.addEventListener('click', () => selectField('hh'));
  mmEl.addEventListener('click', () => selectField('mm'));
  ssEl.addEventListener('click', () => { /* no-op */ });

  // ----- Adjust time (when NOT running)
  function adjust(field, delta){
    if (isRunning || isBeeping) return;

    const h = parseInt(hhEl.textContent, 10);
    const m = parseInt(mmEl.textContent, 10);
    const s = parseInt(ssEl.textContent, 10);

    let newH = h, newM = m;

    if (field === 'hh'){
      newH = Math.max(0, newH + delta);
    } else if (field === 'mm'){
      newM = newM + delta;
      if (newM < 0) newM = 0;
      if (newM > 59) newM = 59;
    }

    const newTotal = (newH * 3600) + (newM * 60) + s;
    totalSeconds = newTotal;
    remainingSeconds = newTotal;
    presetSeconds = newTotal;

    setDisplayFromSeconds(newTotal);
    syncRing();
  }

  plus.addEventListener('click', () => {
    if (selectedField === 'hh') adjust('hh', +1);
    else adjust('mm', +1);
  });

  minus.addEventListener('click', () => {
    if (selectedField === 'hh') adjust('hh', -1);
    else adjust('mm', -1);
  });

// ----- Audio beep (CUSTOM FILE via <audio>)
const alarm = new Audio("./sounds/ding.mp3");
alarm.volume = 1.0;
alarm.loop = true; 
alarm.preload = "auto";
alarm.playsInline = true;


let beepAutoStopId = null;
async function startBeep(){
      stopBeep();
      isBeeping = true;
      alarm.currentTime = 0;
      try {
        await alarm.play();
    } catch (e) {
        console.warn("Alarm play blocked:", e);
    }
    // Auto-stop after 1 minute OR earlier if user stops/resets 
    beepAutoStopId = setTimeout(() => {
        stopBeep();
    }, 60_000);
}

function stopBeep(){
  // Cancel pending auto-stop timer if running
  if (beepAutoStopId !== null) {
    clearTimeout(beepAutoStopId);
    beepAutoStopId = null;
  }
  isBeeping = false;
  try {
    alarm.pause();
    alarm.currentTime = 0;
  } catch (e) {}
}


  // ----- Timer engine
  function setMainIcon(state){
    if (state === 'play') btnMain.innerHTML = ICON_PLAY;
    if (state === 'pause') btnMain.innerHTML = ICON_PAUSE;
    if (state === 'stop') btnMain.innerHTML = ICON_STOP;
  }
  
  function start(){
    if (isBeeping) return;
    if (totalSeconds <= 0) return;
    if (isRunning) return;

    isRunning = true;
    setMainIcon('pause');

    // Setup animation timing
    startPerf = performance.now();
    baseRemainingMs = remainingSeconds * 1000;
    lastWholeSec = null;

    const animate = (now) => {
        if (!isRunning) return;

        const elapsedMs = now - startPerf;
        const remainingMs = Math.max(0, baseRemainingMs - elapsedMs);

        // smooth ring 
        const frac = totalSeconds > 0 ? (remainingMs / (totalSeconds * 1000)) : 1;
        setRingByFractionRemaining(frac);

        // Update numeric display only when the whole second changes
        const wholeSec = Math.ceil(remainingMs / 1000); 
        if (wholeSec !== lastWholeSec) {
        lastWholeSec = wholeSec;
        remainingSeconds = Math.max(0, wholeSec);
        setDisplayFromSeconds(remainingSeconds);
        }

        // Finish
        if (remainingMs <= 0) {
        isRunning = false;
        rafId = null;

        remainingSeconds = 0;
        setDisplayFromSeconds(0);

        setMainIcon('stop');
        setRingByFractionRemaining(0);
        startBeep();
        return;
        }

        rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    }
function pause(){
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  isRunning = false;
}


  btnMain.addEventListener('click', () => {
    // If beeping, clicking main acts as "stop" and resets
    if (isBeeping){
      resetToPreset();
      return;
    }

    if (!isRunning){
      if (totalSeconds <= 0) totalSeconds = Math.max(1, remainingSeconds);
      start();
    } else {
      pause();
      setMainIcon('play');
    }
  });

  btnReset.addEventListener('click', () => {
    resetToPreset();
  });

  btnTheme.addEventListener('click', () => {
    const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next);
  });

  // Init
  function init(){
    totalSeconds = 0;
    remainingSeconds = 0;
    presetSeconds = 0;
    setDisplayFromSeconds(0);
    setMainIcon('play');
    selectField('hh');
    setRingByFractionRemaining(1);
  }
  init();
})();
