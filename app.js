const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const DEFAULT_TUNING = ["E", "A", "D", "G", "B", "E"];
const NATURAL_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const nameInput = document.querySelector("#diagram-name");
const nameModeAutoBtn = document.querySelector("#name-mode-auto");
const nameModeCustomBtn = document.querySelector("#name-mode-custom");
const startFretInput = document.querySelector("#start-fret");
const endFretInput = document.querySelector("#end-fret");
const tuningInputs = document.querySelector("#tuning-inputs");
const fretboard = document.querySelector("#fretboard");
const title = document.querySelector("#diagram-title");
const chordHint = document.querySelector("#chord-hint");
const savedSection = document.querySelector("#saved-section");
const savedCards = document.querySelector("#saved-cards");
const savedCount = document.querySelector("#saved-count");
const exportPdfBtn = document.querySelector("#export-pdf-btn");
const relativeModeToggle = document.querySelector("#relative-mode-toggle");
let marks = new Map();
let rootPitchClass = null;
let outlineMarks = new Set();
let editingKey = null;
let nameMode = "auto";

const FIXED_DEGREE_LABELS = { 0: "1", 4: "3", 7: "5", 10: "♭7", 11: "7" };
const AMBIGUOUS_DEGREE_PAIRS = {
  1: ["♭2", "♭9"],
  2: ["2", "9"],
  3: ["♭3", "♯9"],
  5: ["4", "11"],
  6: ["♭5", "♯11"],
  8: ["♯5", "♭13"],
  9: ["6", "13"],
};

function degreeLabelFor(semitone) {
  return FIXED_DEGREE_LABELS[semitone] ?? AMBIGUOUS_DEGREE_PAIRS[semitone]?.[0] ?? String(semitone);
}

function defaultLabelForKey(tuning, key, rootPitchClass, relativeMode) {
  const [string, fret] = key.split("-").map(Number);
  const pitchClass = (tuning[string] + fret) % 12;
  if (rootPitchClass !== null && pitchClass === rootPitchClass) return "R";
  if (relativeMode && rootPitchClass !== null) {
    return degreeLabelFor((pitchClass - rootPitchClass + 12) % 12);
  }
  return NOTE_NAMES[pitchClass];
}

function forceRootLabelForPitch(tuning, pitchClass) {
  for (const [key, value] of marks) {
    const [string, fret] = key.split("-").map(Number);
    if ((tuning[string] + fret) % 12 !== pitchClass) continue;
    if (typeof value === "string" && !/\d/.test(value)) continue;
    marks.set(key, null);
  }
}

function setNameMode(mode) {
  nameMode = mode;
  nameModeAutoBtn.classList.toggle("is-active", mode === "auto");
  nameModeCustomBtn.classList.toggle("is-active", mode === "custom");
  if (mode === "custom") nameInput.focus();
}

function noteToSemitone(note) {
  const normalized = note.trim().toUpperCase().replace("♯", "#").replace("♭", "B");
  const base = NATURAL_SEMITONES[normalized[0]];
  if (base === undefined) return null;
  return (base + (normalized[1] === "#" ? 1 : normalized[1] === "B" ? -1 : 0) + 12) % 12;
}

function currentTuning() {
  return [...tuningInputs.querySelectorAll("input")].map((input, i) => noteToSemitone(input.value) ?? noteToSemitone(DEFAULT_TUNING[i]));
}

const CHORD_FORMULAS = [
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
  { suffix: "dim", intervals: [0, 3, 6] },
  { suffix: "aug", intervals: [0, 4, 8] },
  { suffix: "sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", intervals: [0, 5, 7] },
  { suffix: "maj7", intervals: [0, 4, 7, 11] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "m7", intervals: [0, 3, 7, 10] },
  { suffix: "m7♭5", intervals: [0, 3, 6, 10] },
  { suffix: "dim7", intervals: [0, 3, 6, 9] },
  { suffix: "mMaj7", intervals: [0, 3, 7, 11] },
  { suffix: "add9", intervals: [0, 2, 4, 7] },
  { suffix: "madd9", intervals: [0, 2, 3, 7] },
  { suffix: "9", intervals: [0, 2, 4, 7, 10] },
  { suffix: "maj9", intervals: [0, 2, 4, 7, 11] },
  { suffix: "m9", intervals: [0, 2, 3, 7, 10] },
];

function detectChordName(pitchClasses, forcedRoot) {
  const unique = [...new Set(pitchClasses)];
  if (unique.length < 3) return null;
  const rootCandidates = forcedRoot !== null && unique.includes(forcedRoot) ? [forcedRoot] : unique;

  for (const root of rootCandidates) {
    const relative = unique.map(pitch => (pitch - root + 12) % 12).sort((a, b) => a - b);
    for (const formula of CHORD_FORMULAS) {
      const target = [...formula.intervals].sort((a, b) => a - b);
      if (relative.length === target.length && relative.every((value, index) => value === target[index])) {
        return NOTE_NAMES[root] + formula.suffix;
      }
    }
  }

  let best = null;
  for (const root of rootCandidates) {
    const relative = unique.map(pitch => (pitch - root + 12) % 12);
    for (const formula of CHORD_FORMULAS) {
      if (!relative.every(value => formula.intervals.includes(value))) continue;
      if (!best || formula.intervals.length < best.formula.intervals.length) best = { root, formula };
    }
  }
  return best ? NOTE_NAMES[best.root] + best.formula.suffix : null;
}

function pruneRootIfUnused() {
  if (rootPitchClass === null) return;
  const tuning = currentTuning();
  const stillExists = [...marks.keys()].some(key => {
    const [string, fret] = key.split("-").map(Number);
    return (tuning[string] + fret) % 12 === rootPitchClass;
  });
  if (!stillExists) rootPitchClass = null;
}

function renderTuning() {
  tuningInputs.innerHTML = DEFAULT_TUNING.map((note, index) => `
    <label>${6 - index}弦<input data-string="${index}" value="${note}" maxlength="2" aria-label="第 ${6 - index} 弦調音" /></label>`).join("");
  tuningInputs.querySelectorAll("input").forEach(input => input.addEventListener("change", renderBoard));
}

function renderBoard() {
  let startFret = Math.min(23, Math.max(0, Number(startFretInput.value) || 0));
  let endFret = Math.min(24, Math.max(startFret, Number(endFretInput.value) || startFret));
  startFretInput.value = startFret;
  endFretInput.value = endFret;
  const firstGridFret = Math.max(1, startFret);
  const frets = Math.max(1, endFret - firstGridFret + 1);
  const tuning = currentTuning();
  const detectedChord = detectChordName([...marks.keys()].filter(key => !outlineMarks.has(key)).map(key => {
    const [string, fret] = key.split("-").map(Number);
    return (tuning[string] + fret) % 12;
  }), rootPitchClass);
  if (nameMode === "auto") nameInput.value = detectedChord || "";
  title.textContent = nameInput.value.trim() || "未命名圖表";
  chordHint.hidden = !detectedChord;
  chordHint.textContent = detectedChord ? `偵測到和弦：${detectedChord}` : "";
  const stepX = 118, stepY = 66, width = frets * stepX, height = 5 * stepY;
  const textSize = frets > 8 ? 13 : 18;
  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char]);
  let svg = `<svg class="fret-svg" viewBox="-72 -30 ${width + 90} ${height + 90}" role="img" aria-label="${title.textContent} 指板圖">`;
  for (let fret = 0; fret <= frets; fret++) svg += `<line class="fret-line ${fret === 0 ? "nut" : ""}" x1="${fret * stepX}" y1="0" x2="${fret * stepX}" y2="${height}"/>`;
  for (let string = 0; string < 6; string++) svg += `<line class="string-line" x1="0" y1="${(5 - string) * stepY}" x2="${width}" y2="${(5 - string) * stepY}"/>`;
  svg += `<rect class="hit-area" x="-70" y="0" width="${width + 70}" height="${height}"/>`;
  for (let index = 0; index < frets; index++) svg += `<text class="fret-number" x="${(index + .5) * stepX}" y="${height + 38}">${firstGridFret + index}</text>`;
  const visibleMarks = new Map(marks);
  if (editingKey && !visibleMarks.has(editingKey)) visibleMarks.set(editingKey, "");
  for (const [key, savedValue] of visibleMarks) {
    const [string, fret] = key.split("-").map(Number);
    if (fret < startFret || fret > endFret) continue;
    // 音符落在弦線上，x 軸則是該格的中央，而不是分隔線交點。
    const x = fret === 0 ? -42 : (fret - firstGridFret + .5) * stepX, y = (5 - string) * stepY;
    const pitchClass = (tuning[string] + fret) % 12;
    const isRootPitch = rootPitchClass !== null && pitchClass === rootPitchClass;
    const isOutline = outlineMarks.has(key);
    const interval = rootPitchClass !== null ? (pitchClass - rootPitchClass + 12) % 12 : null;
    const defaultValue = defaultLabelForKey(tuning, key, rootPitchClass, relativeModeToggle.checked);
    const displayValue = savedValue || defaultValue;
    if (key === editingKey) {
      const degreePair = relativeModeToggle.checked && interval !== null ? AMBIGUOUS_DEGREE_PAIRS[interval] : null;
      const degreeToggleBtn = degreePair
        ? `<button type="button" id="degree-toggle" class="degree-toggle" data-options="${degreePair[0]},${degreePair[1]}" aria-label="切換 ${degreePair[0]} / ${degreePair[1]}" title="切換 ${degreePair[0]} / ${degreePair[1]}">⇄</button>`
        : "";
      svg += `<foreignObject x="${x - (degreePair ? 97 : 81)}" y="${y - 20}" width="${degreePair ? 194 : 162}" height="40" style="overflow:visible"><div xmlns="http://www.w3.org/1999/xhtml" class="marker-editor-row"><input id="marker-editor" class="marker-editor" value="${escapeHtml(displayValue)}" maxlength="8" aria-label="第 ${6 - string} 弦第 ${fret} 格標記" />${degreeToggleBtn}<button type="button" id="root-toggle" class="root-toggle ${isRootPitch ? "is-active" : ""}" aria-pressed="${isRootPitch}" aria-label="設為根音" title="設為根音">●</button><button type="button" id="outline-toggle" class="outline-toggle ${isOutline ? "is-active" : ""}" aria-pressed="${isOutline}" aria-label="設為其他可用音" title="設為其他可用音（空心）">○</button></div></foreignObject>`;
    } else {
      svg += `<circle class="marker-circle ${isRootPitch ? "is-root" : ""} ${isOutline ? "is-outline" : ""}" cx="${x}" cy="${y}" r="23"/><text class="marker-text ${isOutline ? "on-outline" : ""}" x="${x}" y="${y}" font-size="${textSize}">${escapeHtml(displayValue)}</text>`;
    }
  }
  svg += `</svg>`;
  fretboard.innerHTML = svg;
  const board = fretboard.querySelector("svg");
  const getPosition = event => {
    const rect = board.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (width + 90) / rect.width - 72;
    const y = (event.clientY - rect.top) * (height + 90) / rect.height - 30;
    return {
      string: Math.max(0, Math.min(5, 5 - Math.round(y / stepY))),
      fret: startFret === 0 && x < 0
        ? 0
        : Math.max(firstGridFret, Math.min(endFret, Math.floor(x / stepX) + firstGridFret))
    };
  };
  board.addEventListener("click", event => {
    if (event.target.closest && event.target.closest("#marker-editor, #root-toggle, #outline-toggle, #degree-toggle")) return;
    const { string, fret } = getPosition(event), key = `${string}-${fret}`;
    if (relativeModeToggle.checked && rootPitchClass === null && marks.size === 0 && !marks.has(key)) {
      rootPitchClass = (tuning[string] + fret) % 12;
    }
    editingKey = key;
    renderBoard();
  });
  board.addEventListener("contextmenu", event => {
    event.preventDefault();
    const { string, fret } = getPosition(event);
    const deleteKey = `${string}-${fret}`;
    marks.delete(deleteKey);
    outlineMarks.delete(deleteKey);
    pruneRootIfUnused();
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
      if (!text) { marks.delete(key); outlineMarks.delete(key); }
      else {
        const defaultValue = defaultLabelForKey(tuning, key, rootPitchClass, relativeModeToggle.checked);
        marks.set(key, text === defaultValue ? null : text);
      }
      pruneRootIfUnused();
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
    const degreeToggle = document.querySelector("#degree-toggle");
    if (degreeToggle) {
      degreeToggle.addEventListener("mousedown", event => event.preventDefault());
      degreeToggle.addEventListener("click", event => {
        event.stopPropagation();
        const [optionA, optionB] = degreeToggle.dataset.options.split(",");
        editor.value = editor.value.trim() === optionA ? optionB : optionA;
        editor.focus();
        editor.select();
      });
    }
    const rootToggle = document.querySelector("#root-toggle");
    rootToggle.addEventListener("mousedown", event => event.preventDefault());
    rootToggle.addEventListener("click", event => {
      event.stopPropagation();
      const key = editingKey;
      const [string, fret] = key.split("-").map(Number);
      const pitchClass = (tuning[string] + fret) % 12;
      const becomingRoot = rootPitchClass !== pitchClass;
      const text = editor.value.trim();
      if (!text) {
        marks.delete(key);
      } else if (becomingRoot) {
        // 設為根音時，只要文字含數字（不論是自動推算還是自己打的）就強制顯示 R；純文字自訂內容不動。
        marks.set(key, /\d/.test(text) ? null : text);
      } else {
        const defaultValue = defaultLabelForKey(tuning, key, rootPitchClass, relativeModeToggle.checked);
        marks.set(key, text === defaultValue ? null : text);
      }
      if (becomingRoot) forceRootLabelForPitch(tuning, pitchClass);
      rootPitchClass = becomingRoot ? pitchClass : null;
      editingKey = null;
      renderBoard();
    });
    const outlineToggle = document.querySelector("#outline-toggle");
    outlineToggle.addEventListener("mousedown", event => event.preventDefault());
    outlineToggle.addEventListener("click", event => {
      event.stopPropagation();
      const key = editingKey;
      const text = editor.value.trim();
      if (!text) marks.delete(key);
      else {
        const defaultValue = defaultLabelForKey(tuning, key, rootPitchClass, relativeModeToggle.checked);
        marks.set(key, text === defaultValue ? null : text);
      }
      if (outlineMarks.has(key)) outlineMarks.delete(key);
      else outlineMarks.add(key);
      renderBoard();
    });
  }
}

nameInput.addEventListener("input", () => {
  if (nameMode === "auto") setNameMode("custom");
  renderBoard();
});
nameModeAutoBtn.addEventListener("click", () => { setNameMode("auto"); renderBoard(); });
nameModeCustomBtn.addEventListener("click", () => { setNameMode("custom"); renderBoard(); });
function updateFretRange() {
  const start = Math.max(0, Number(startFretInput.value) || 0);
  const end = Math.max(start, Number(endFretInput.value) || start);
  marks = new Map([...marks].filter(([key]) => {
    const fret = Number(key.split("-")[1]);
    return fret >= start && fret <= end;
  }));
  outlineMarks = new Set([...outlineMarks].filter(key => marks.has(key)));
  pruneRootIfUnused();
  renderBoard();
}

startFretInput.addEventListener("change", updateFretRange);
endFretInput.addEventListener("change", updateFretRange);
document.querySelector("#clear-btn").addEventListener("click", () => { marks.clear(); outlineMarks.clear(); rootPitchClass = null; editingKey = null; renderBoard(); });

function updateSavedCount() {
  const total = savedCards.querySelectorAll(".saved-card").length;
  savedCount.textContent = total;
  savedSection.hidden = total === 0;
}

function setCardWide(card, wide) {
  card.classList.toggle("full", wide);
  card.dataset.wide = wide ? "1" : "0";
  const handle = card.querySelector(".resize-saved");
  if (handle) handle.setAttribute("aria-label", wide ? "縮小為一半寬度" : "展開為整行寬度");
}

savedCards.addEventListener("dragover", event => {
  const dragging = savedCards.querySelector(".saved-card.is-moving");
  if (!dragging) return;
  event.preventDefault();
  const target = event.target.closest && event.target.closest(".saved-card");
  if (!target || target === dragging) return;
  const rect = target.getBoundingClientRect();
  const before = event.clientY < rect.top + rect.height / 2
    || (event.clientY < rect.bottom && event.clientX < rect.left + rect.width / 2);
  savedCards.insertBefore(dragging, before ? target : target.nextSibling);
});

function attachSavedCardControls(card, handle) {
  const header = card.querySelector(".saved-card-header");
  card.draggable = true;
  card.addEventListener("dragstart", event => {
    if (event.target.closest("button")) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-moving");
  });
  card.addEventListener("dragend", () => card.classList.remove("is-moving"));

  handle.addEventListener("click", event => {
    event.stopPropagation();
    setCardWide(card, !card.classList.contains("full"));
  });
}

document.querySelector("#save-btn").addEventListener("click", () => {
  if (editingKey) return;
  const displayedGrids = Math.max(1, Number(endFretInput.value) - Math.max(1, Number(startFretInput.value)) + 1);
  const card = document.createElement("article");
  card.className = "saved-card";
  const header = document.createElement("div");
  header.className = "saved-card-header";
  const details = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = title.textContent;
  details.append(name);
  const remove = document.createElement("button");
  remove.className = "delete-saved";
  remove.textContent = "刪除";
  remove.addEventListener("click", () => {
    card.remove();
    updateSavedCount();
  });
  header.append(details, remove);
  const snapshot = fretboard.querySelector("svg").cloneNode(true);
  snapshot.querySelectorAll(".hit-area, foreignObject").forEach(element => element.remove());
  const diagramWrap = document.createElement("div");
  diagramWrap.className = "saved-diagram";
  diagramWrap.append(snapshot);
  const handle = document.createElement("button");
  handle.className = "resize-saved";
  handle.type = "button";
  handle.setAttribute("aria-label", "調整大小");
  card.append(header, diagramWrap, handle);
  savedCards.append(card);
  setCardWide(card, displayedGrids > 5);
  attachSavedCardControls(card, handle);
  updateSavedCount();
});

const PDF_ROWS_PER_PAGE = 4;

function groupCardsIntoRows(cards) {
  const rows = [];
  let pendingHalf = null;
  cards.forEach(card => {
    if (card.classList.contains("full")) {
      if (pendingHalf) { rows.push([pendingHalf]); pendingHalf = null; }
      rows.push([card]);
    } else if (pendingHalf) {
      rows.push([pendingHalf, card]);
      pendingHalf = null;
    } else {
      pendingHalf = card;
    }
  });
  if (pendingHalf) rows.push([pendingHalf]);
  return rows;
}

function chunkRows(rows, size) {
  const pages = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
}

const printView = document.querySelector("#print-view");

exportPdfBtn.addEventListener("click", () => {
  const cards = [...savedCards.querySelectorAll(".saved-card")];
  if (!cards.length) return;

  printView.innerHTML = "";
  chunkRows(groupCardsIntoRows(cards), PDF_ROWS_PER_PAGE).forEach(rowsChunk => {
    const page = document.createElement("div");
    page.className = "pdf-page";
    rowsChunk.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.className = "pdf-row";
      row.forEach(card => {
        const clone = card.cloneNode(true);
        clone.classList.remove("is-moving", "is-resizing");
        clone.removeAttribute("draggable");
        clone.querySelectorAll(".resize-saved, .delete-saved").forEach(button => button.remove());
        rowEl.append(clone);
      });
      page.append(rowEl);
    });
    printView.append(page);
  });

  window.print();
});

relativeModeToggle.addEventListener("change", renderBoard);

renderTuning();
renderBoard();
