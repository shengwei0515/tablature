const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const DEFAULT_TUNING = ["E", "A", "D", "G", "B", "E"];
const NATURAL_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const chordInput = document.querySelector("#chord-name");
const startFretInput = document.querySelector("#start-fret");
const endFretInput = document.querySelector("#end-fret");
const tuningInputs = document.querySelector("#tuning-inputs");
const fretboard = document.querySelector("#fretboard");
const title = document.querySelector("#diagram-title");
let marks = new Map();
let editingKey = null;

function noteToSemitone(note) {
  const normalized = note.trim().toUpperCase().replace("♯", "#").replace("♭", "B");
  const base = NATURAL_SEMITONES[normalized[0]];
  if (base === undefined) return null;
  return (base + (normalized[1] === "#" ? 1 : normalized[1] === "B" ? -1 : 0) + 12) % 12;
}

function currentTuning() {
  return [...tuningInputs.querySelectorAll("input")].map((input, i) => noteToSemitone(input.value) ?? noteToSemitone(DEFAULT_TUNING[i]));
}

function renderTuning() {
  tuningInputs.innerHTML = DEFAULT_TUNING.map((note, index) => `
    <label>${6 - index}弦<input data-string="${index}" value="${note}" maxlength="2" aria-label="第 ${6 - index} 弦調音" /></label>`).join("");
  tuningInputs.querySelectorAll("input").forEach(input => input.addEventListener("change", renderBoard));
}

function renderBoard() {
  let startFret = Math.max(0, Number(startFretInput.value) || 0);
  let endFret = Math.max(startFret, Number(endFretInput.value) || startFret);
  startFretInput.value = startFret;
  endFretInput.value = endFret;
  const firstGridFret = Math.max(1, startFret);
  const frets = Math.max(1, endFret - firstGridFret + 1);
  const tuning = currentTuning();
  title.textContent = chordInput.value.trim() || "未命名和弦";
  const stepX = 118, stepY = 66, width = frets * stepX, height = 5 * stepY;
  const textSize = frets > 8 ? 13 : 18;
  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char]);
  let svg = `<svg class="chord-svg" viewBox="-72 -18 ${width + 90} ${height + 66}" role="img" aria-label="${title.textContent} 和弦圖">`;
  for (let fret = 0; fret <= frets; fret++) svg += `<line class="fret-line ${fret === 0 ? "nut" : ""}" x1="${fret * stepX}" y1="0" x2="${fret * stepX}" y2="${height}"/>`;
  for (let string = 0; string < 6; string++) svg += `<line class="string-line" x1="0" y1="${string * stepY}" x2="${width}" y2="${string * stepY}"/>`;
  svg += `<rect class="hit-area" x="-70" y="0" width="${width + 70}" height="${height}"/>`;
  for (let index = 0; index < frets; index++) svg += `<text class="fret-number" x="${(index + .5) * stepX}" y="${height + 38}">${firstGridFret + index}</text>`;
  const visibleMarks = new Map(marks);
  if (editingKey && !visibleMarks.has(editingKey)) visibleMarks.set(editingKey, "");
  for (const [key, savedValue] of visibleMarks) {
    const [string, fret] = key.split("-").map(Number);
    if (fret < startFret || fret > endFret) continue;
    // 音符落在弦線上，x 軸則是該格的中央，而不是分隔線交點。
    const x = fret === 0 ? -42 : (fret - firstGridFret + .5) * stepX, y = string * stepY;
    if (key === editingKey) {
      const value = savedValue || NOTE_NAMES[(tuning[string] + fret) % 12];
      svg += `<foreignObject x="${x - 35}" y="${y - 18}" width="70" height="36"><div xmlns="http://www.w3.org/1999/xhtml"><input id="marker-editor" class="marker-editor" value="${escapeHtml(value)}" maxlength="8" aria-label="第 ${6 - string} 弦第 ${fret} 格標記" /></div></foreignObject>`;
    } else {
      svg += `<circle class="marker-circle" cx="${x}" cy="${y}" r="23"/><text class="marker-text" x="${x}" y="${y}" font-size="${textSize}">${escapeHtml(savedValue)}</text>`;
    }
  }
  svg += `</svg>`;
  fretboard.innerHTML = svg;
  const board = fretboard.querySelector("svg");
  const getPosition = event => {
    const rect = board.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (width + 90) / rect.width - 72;
    const y = (event.clientY - rect.top) * (height + 66) / rect.height - 18;
    return {
      string: Math.max(0, Math.min(5, Math.round(y / stepY))),
      fret: startFret === 0 && x < 0
        ? 0
        : Math.max(firstGridFret, Math.min(endFret, Math.floor(x / stepX) + firstGridFret))
    };
  };
  board.addEventListener("click", event => {
    if (event.target.closest && event.target.closest("#marker-editor")) return;
    const { string, fret } = getPosition(event), key = `${string}-${fret}`;
    editingKey = key;
    renderBoard();
  });
  board.addEventListener("contextmenu", event => {
    event.preventDefault();
    const { string, fret } = getPosition(event);
    marks.delete(`${string}-${fret}`);
    editingKey = null;
    renderBoard();
  });
  const editor = document.querySelector("#marker-editor");
  if (editor) {
    let finished = false;
    const save = () => {
      if (finished || !editingKey) return;
      finished = true;
      const key = editingKey;
      const text = editor.value.trim();
      if (text) marks.set(key, text);
      else marks.delete(key);
      editingKey = null;
      renderBoard();
    };
    editor.focus();
    editor.select();
    editor.addEventListener("keydown", event => {
      if (event.key === "Enter") save();
      if (event.key === "Escape") { finished = true; editingKey = null; renderBoard(); }
    });
    editor.addEventListener("blur", save, { once: true });
  }
}

chordInput.addEventListener("input", renderBoard);
function updateFretRange() {
  const start = Math.max(0, Number(startFretInput.value) || 0);
  const end = Math.max(start, Number(endFretInput.value) || start);
  marks = new Map([...marks].filter(([key]) => {
    const fret = Number(key.split("-")[1]);
    return fret >= start && fret <= end;
  }));
  renderBoard();
}

startFretInput.addEventListener("change", updateFretRange);
endFretInput.addEventListener("change", updateFretRange);
document.querySelector("#clear-btn").addEventListener("click", () => { marks.clear(); editingKey = null; renderBoard(); });
renderTuning();
renderBoard();
