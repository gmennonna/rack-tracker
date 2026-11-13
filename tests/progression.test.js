// Progression after time off (gap rules, return ramp) and stall detection around breaks.
// Run from the repo root: node tests/progression.test.js
const path = require('path');
const { execFileSync } = require('child_process');
const { load, loadSource } = require('./load-app.js');

const INDEX = path.join(__dirname, '..', 'index.html');
// Version before the time-off change, for "unchanged behaviour" checks. Skipped without git.
const BASELINE_COMMIT = '5dc7913';
const app = load(INDEX);
let old = null;
try{
  old = loadSource(execFileSync('git', ['show', `${BASELINE_COMMIT}:index.html`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }));
}catch(e){
  console.log(`Baseline ${BASELINE_COMMIT} not available (no git?): skipping comparisons with the previous version.`);
}
let pass = 0, fail = 0;
const eq = (a, b, msg)=>{
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if(A === B) pass++; else { fail++; console.log(`FAIL ${msg}\n  got:      ${A}\n  expected: ${B}`); }
};
const ok = (c, msg)=> eq(!!c, true, msg);

const NOW = new Date('2026-11-13T12:00:00');
const ago = (n, now = NOW)=>{ const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(18, 0, 0, 0); return d; };
const sess = (n, name, sets, day = 'A')=> ({ day, date: ago(n).toISOString(), exercises:[{ name, sets: sets.map(([w, r])=> ({ weight:w, reps:r })) }] });
const W = s=> s.sets.map(x=> x.weight), R = s=> s.sets.map(x=> x.reps);
const bench = { name:'Bench', sets:4, reps:'8-10', increment:2.5 };
const at = n=>{ const d = ago(n); d.setHours(8); return d; };   // morning of day -n, before that day's session
const sug = (ex, list, now = NOW)=> app.exerciseSuggestion(ex, false, now, list);
const four = (w, r)=> Array.from({ length:4 }, ()=> [w, r]);

/* 1. Gap thresholds */
const gapCase = (days, w = 80, r = 9)=> sug(bench, [sess(days + 7, 'Bench', four(w, r)), sess(days, 'Bench', four(w, r))]);
for(const d of [7, 10]){
  const s = gapCase(d);
  eq([W(s), R(s), s.adjust], [[80,80,80,80],[10,10,10,10], null], `gap ${d}: normal progression`);
  eq(W(gapCase(d, 80, 10)), [82.5,82.5,82.5,82.5], `gap ${d}: top of range still adds load`);
}
for(const d of [11, 20]){
  const s = gapCase(d, 80, 10);
  eq([W(s), R(s), s.adjust.kind], [[80,80,80,80],[10,10,10,10], 'hold'], `gap ${d}: hold, no increase at top of range`);
  eq(app.adjustNoteText(s), `Back after ${d} days — holding weights`, `gap ${d}: note`);
  eq(app.formatProgressionSummary(s), 'Repeat last session', `gap ${d}: summary`);
}
for(const d of [21, 34]){
  const s = gapCase(d);
  eq([W(s), R(s), s.adjust.kind], [[70,70,70,70],[8,8,8,8], 'reduce'], `gap ${d}: -10% floored (72 -> 70), bottom of range`);
  eq(app.adjustNoteText(s), `Back after ${d} days — eased 10%`, `gap ${d}: note`);
}
for(const d of [35, 60]){
  const s = gapCase(d);
  eq([W(s), R(s), s.adjust.kind], [[62.5,62.5,62.5,62.5],[8,8,8,8], 'reset'], `gap ${d}: -20% floored (64 -> 62.5)`);
  eq(app.adjustNoteText(s), `Back after ${d} days — eased 20%`, `gap ${d}: note`);
}
eq(sug(bench, [sess(30, 'Bench', four(80, 9), 'A'), sess(5, 'Bench', four(80, 9), 'C')]).adjust, null, 'gap measured from the latest session on any day');
eq(app.progressionContext([{ date: new Date('2026-10-23T23:30:00'), sets:[] }], new Date('2026-11-13T00:10:00')).gapDays, 21, 'calendar days ignore time of day');

/* 2. Rounding */
const one = (w, inc, days)=> W(sug({ name:'X', sets:1, reps:'8-10', increment:inc }, [sess(days, 'X', [[w, 9]])]))[0];
eq([one(77, 1, 25), one(77, 2, 25), one(77, 2.5, 25)], [69, 68, 67.5], 'reduce 77 (69.3): inc 1 / 2 / 2.5');
eq([one(77, 1, 40), one(77, 2, 40), one(77, 2.5, 40)], [61, 60, 60], 'reset 77 (61.6): inc 1 / 2 / 2.5');
eq([one(80, 1, 25), one(80, 2, 25), one(50, 2.5, 40), one(72.5, 2.5, 40), one(62.5, 2.5, 40)], [72, 72, 40, 57.5, 50], 'exact multiples stay (no float drift)');
eq([one(2.5, 2.5, 40), one(5, 2.5, 40), one(3, 2, 40)], [2.5, 2.5, 2], 'never below one increment');
eq(one(80, 0, 25), 70, 'no increment set -> default 2.5');

/* 3. Bodyweight */
const pull = { name:'Pull-up', sets:4, reps:'8-10' };
const bw = (days, reps, ex = pull)=> sug(ex, [sess(days, ex.name, reps.map(r=> [null, r]))]);
let s = bw(25, [12, 10, 9, 7]);
eq([W(s), R(s), s.bodyweight], [[null,null,null,null],[10,8,8,8], true], 'bodyweight 25 d: ~80% reps, never below range bottom');
eq(app.adjustNoteText(s), 'Back after 25 days — eased reps', 'bodyweight note');
eq(R(bw(60, [15, 14, 13, 12])), [12, 11, 10, 10], 'bodyweight 60 d: 80%');
eq(R(bw(25, [10, 5], { name:'Dips', sets:2, reps:'' })), [8, 4], 'bodyweight without range: 80%, no floor');
s = bw(15, [12, 10, 9, 7]);
eq([R(s), app.adjustNoteText(s)], [[12,10,9,7], 'Back after 15 days — holding reps'], 'bodyweight hold');
eq(app.renderSuggestionHtml(bw(25, [12])).includes('sug-set eased'), false, 'bodyweight sets are never "eased"');

/* 4. Return ramp */
function simulate(ex, list, startDay, steps){
  const out = [];
  let day = startDay;
  for(const step of steps){
    const now = at(day);
    const sg = app.exerciseSuggestion(ex, false, now, list);
    const sets = sg.sets.map((x, i)=> [x.weight, step[i] != null ? step[i] : step[0]]);
    out.push({ sug: sg, note: app.adjustNoteText(sg), stall: app.detectStall(ex.name, list, { now }).status });
    list.push(sess(day, ex.name, sets));
    day -= 4;
  }
  const end = ago(day + 4); end.setHours(20);
  return { out, list, finalStall: app.detectStall(ex.name, list, { now: end }).status };
}
// 75 kg before a 25-day break, eased to 67.5, then 70 -> 72.5 -> 75 in 3 sessions.
const pre = [sess(80, 'Bench', four(72.5, 10)), sess(76, 'Bench', four(75, 8)), sess(72, 'Bench', four(75, 9)), sess(68, 'Bench', four(75, 10))];
let run = simulate(bench, [...pre], 43, [[8], [8], [8], [8], [9], [10], [8]]);
eq(run.out.map(o=> W(o.sug)[0]), [67.5, 70, 72.5, 75, 75, 75, 77.5], 'ramp: eased, +2.5 per session at range bottom, cap 75, then double progression');
eq(run.out.map(o=> R(o.sug)[0]), [8, 8, 8, 8, 9, 10, 8], 'ramp reps: bottom of range while returning, then +1');
eq(run.out.map(o=> o.note), ['Back after 25 days — eased 10%', 'Returning — +2.5 kg toward 75 kg', 'Returning — +2.5 kg toward 75 kg', 'Returning — +2.5 kg toward 75 kg', '', '', ''], 'ramp notes');
eq(run.out.map(o=> o.stall).concat(run.finalStall).filter(x=> x === 'stalled' || x === 'regressing'), [], 'ramp: no false stalled/regressing at any point');

// Never above the pre-break weight.
const capList = ()=> [sess(60, 'Bench', four(80, 10)), sess(30, 'Bench', four(77.5, 10))];
eq(W(sug({ ...bench, increment:5 }, capList(), at(26))), [80,80,80,80], 'return: 77.5 + 5 capped at 80');
s = sug(bench, capList(), at(26));
eq([W(s), R(s), app.adjustNoteText(s)], [[80,80,80,80],[8,8,8,8], 'Returning — +2.5 kg toward 80 kg'], 'return: top of range still capped');
s = sug(bench, [sess(60, 'Bench', four(80, 10)), sess(30, 'Bench', four(72.5, 7))], at(26));
eq([W(s), R(s), app.adjustNoteText(s)], [[72.5,72.5,72.5,72.5],[8,8,8,8], 'Returning — building back to 80 kg'], 'return: below range bottom holds the weight');
s = sug(bench, [sess(60, 'Bench', four(80, 10)), sess(30, 'Bench', four(80, 10))], at(26));
eq([W(s), s.adjust], [[82.5,82.5,82.5,82.5], null], 'back at pre-break weight: normal progression');
s = sug(bench, [sess(120, 'Bench', four(80, 10)), ...Array.from({ length:12 }, (_, k)=> sess(70 - k * 6, 'Bench', four(70, 8))), sess(3, 'Bench', four(70, 9))]);
eq([W(s), s.adjust], [[70,70,70,70], null], 'break more than 8 weeks ago: no return mode');
s = sug(bench, [sess(200, 'Bench', four(100, 10)), sess(60, 'Bench', four(80, 10)), sess(30, 'Bench', four(72.5, 8))], at(26));
eq(app.adjustNoteText(s), 'Returning — +2.5 kg toward 80 kg', 'pre-break best ignores sessions older than 8 weeks before the break');
s = sug(bench, [sess(80, 'Bench', four(80, 10)), sess(50, 'Bench', four(70, 8)), sess(25, 'Bench', four(72.5, 8))]);
eq([W(s), s.adjust.kind], [[65,65,65,65], 'reduce'], 'new 21+ gap during return: gap rule wins');

/* 5. Drop-set pattern after a break */
const drop = { name:'Curl', sets:3, reps:'8-10', increment:2.5 };
run = simulate(drop, [sess(70, 'Curl', [[30,10],[25,8],[20,8]]), sess(66, 'Curl', [[30,10],[25,9],[20,8]])], 40, [[8], [8], [8], [10]]);
eq(run.out.map(o=> W(o.sug)), [[25,22.5,17.5],[27.5,25,20],[30,25,20],[30,25,20]], 'drop sets: per-set ease and ramp with per-set caps');
eq(run.out.map(o=> R(o.sug)), [[8,8,8],[8,8,8],[8,9,9],[9,9,9]], 'drop sets reps');
eq(run.out.map(o=> o.note), ['Back after 26 days — eased 10%', 'Returning — +2.5 kg toward pre-break weights', 'Returning — +2.5 kg toward 30 kg', ''], 'drop sets notes');
eq(run.out.map(o=> o.stall).concat(run.finalStall).filter(x=> x === 'stalled' || x === 'regressing'), [], 'drop sets: no false stall');

/* 6. Stall detection around a break */
const stallAt = (list, n, mod = app)=> mod.detectStall('Bench', list, { now: ago(n) }).status;
const base = [sess(70, 'Bench', four(80, 8)), sess(66, 'Bench', four(80, 8)), sess(62, 'Bench', four(80, 8))];
const climb = [...base, sess(30, 'Bench', four(70, 8)), sess(26, 'Bench', four(72.5, 8)), sess(22, 'Bench', four(75, 8))];
if(old) eq(stallAt(climb, 21, old), 'stalled', 'previous version: confirms the false stall');
eq(stallAt(climb, 21), 'ok', 'climbing after break: ok');
eq(stallAt([...base, sess(30, 'Bench', four(70, 8)), sess(26, 'Bench', four(72.5, 8)), sess(22, 'Bench', four(72.5, 8))], 21), 'ok', 'one flat session during the climb: ok');
eq(stallAt([...base, sess(30, 'Bench', four(75, 8)), sess(26, 'Bench', four(75, 8)), sess(22, 'Bench', four(75, 8))], 21), 'stalled', 'stuck below pre-break for 3 sessions: still stalled');
eq(stallAt([...base, sess(30, 'Bench', four(75, 8)), sess(26, 'Bench', four(80, 8)), sess(22, 'Bench', four(80, 8))], 21), 'ok', 'just matched pre-break level: ok');
eq(stallAt([...base, sess(34, 'Bench', four(75, 8)), sess(30, 'Bench', four(80, 8)), sess(26, 'Bench', four(80, 8)), sess(22, 'Bench', four(80, 8))], 21), 'stalled', 'matched pre-break then flat for 2 sessions: stalled');
eq(stallAt([...base, sess(30, 'Bench', four(75, 10)), sess(26, 'Bench', four(72.5, 8)), sess(22, 'Bench', four(67.5, 8))], 21), 'regressing', 'real regression after a break still flagged');
const genList = ['Bench', 'Row', 'Squat'].flatMap(n=> [sess(70, n, four(80, 8)), sess(66, n, four(80, 8)), sess(30, n, four(70, 8)), sess(26, n, four(72.5, 8)), sess(22, n, four(75, 8))]);
const prog = { A:{ label:'A', exercises:['Bench','Row','Squat'].map(name=> ({ name, sets:4, reps:'8-10' })) } };
if(old) eq(old.detectGeneralStall(prog, genList, ago(21)).general, true, 'previous version: false program-wide banner');
eq(app.detectGeneralStall(prog, genList, ago(21)).general, false, 'no program-wide deload banner after a break');
let rnd = 7; const rand = ()=> (rnd = (rnd * 16807) % 2147483647) / 2147483647;
let diff = 0, changed = 0;
for(let t = 0; old && t < 2000; t++){
  const list = []; let d = 60;
  let pause = false;
  while(d > 0){
    list.push(sess(d, 'Bench', four(60 + Math.floor(rand() * 8) * 2.5, 6 + Math.floor(rand() * 6))));
    const step = 2 + Math.floor(rand() * (t % 2 ? 12 : 22));
    if(d - step > 0 && ago(d - step) - ago(d) > 14 * 86400000) pause = true;
    d -= step;
  }
  const a = app.detectStall('Bench', list, { now: NOW }), b = old.detectStall('Bench', list, { now: NOW });
  if(JSON.stringify(a) !== JSON.stringify(b)){ if(pause && a.status === 'ok' && b.status === 'stalled') changed++; else diff++; }
}
if(old) eq(diff, 0, `detectStall: random histories differ from the previous version only by stalled -> ok, and only with a pause (${changed} such cases)`);

/* 7. Colours: eased sets neutral, back-off stays red */
let html = app.renderSuggestionHtml(gapCase(25));
ok(html.includes('<div class="suggest-note">Back after 25 days — eased 10%</div>Today:'), 'note sits above the targets');
ok(html.includes('sug-set eased') && !html.includes('sug-set down'), 'eased sets use the neutral class, not red');
ok(html.includes('<div class="suggest-summary">↓ −10 kg on sets 1–4</div>'), 'summary sits in the muted summary line');
html = app.renderSuggestionHtml(gapCase(40));
ok(html.includes('sug-set eased') && !html.includes('sug-set down'), 'reset: neutral class');
const backoff = sug(bench, [sess(9, 'Bench', four(80, 6)), sess(5, 'Bench', four(80, 6))]);
html = app.renderSuggestionHtml(backoff);
ok(W(backoff)[0] === 75 && html.includes('sug-set down') && !html.includes('eased') && !html.includes('suggest-note'), 'below-range-twice back-off stays red, no note');
html = app.renderSuggestionHtml(gapCase(15));
ok(html.includes('sug-set same') && html.includes('holding weights') && !html.includes('sug-set down'), 'hold: same class + note');
ok(!app.renderSuggestionHtml(gapCase(5)).includes('suggest-note'), 'no note without an adjustment');
const css = require('fs').readFileSync(INDEX, 'utf8');
ok(/\.sug-set\.eased\{ color:var\(--muted\); \}/.test(css) && /\.suggest-note\{[^}]*color:var\(--muted\)/.test(css), 'CSS: eased sets and note are muted');
ok(/\.suggest-summary\{[^}]*color:var\(--muted\)/.test(css), 'CSS: summary line is muted');

/* 8. Placeholders and the check button follow the adjusted targets */
s = gapCase(40);
eq(app.setPlaceholders(s, 0), { weight:'62.5', reps:'8' }, 'placeholder uses eased target');
eq(app.confirmSetValues({ weight:'', reps:'' }, s.sets[0]), { weight:'62.5', reps:'8', done:true }, 'check button fills eased target');

/* 9. Editing past sessions */
eq(app.exerciseSuggestion(bench, true, NOW, [sess(40, 'Bench', four(80, 9))]), null, 'editing: no suggestion, so no Today line or note');
const edited = [sess(60, 'Bench', four(80, 10)), sess(30, 'Bench', four(72.5, 8))];
eq(app.adjustNoteText(sug(bench, edited, at(26))), 'Returning — +2.5 kg toward 80 kg', 'before edit');
edited[0].exercises[0].sets.forEach(x=> x.weight = 85);
eq(app.adjustNoteText(sug(bench, edited, at(26))), 'Returning — +2.5 kg toward 85 kg', 'edited pre-break session changes the target (derived, not stored)');
edited[0].exercises[0].sets.forEach(x=> x.weight = 72.5);
eq(sug(bench, edited, at(26)).adjust, null, 'edited down to the same weight: return mode ends');

/* 10. Backward compatibility and no data changes */
diff = 0;
for(let t = 0; old && t < 3000; t++){
  const n = 1 + Math.floor(rand() * 4);
  const ex = { name:'X', sets: Math.floor(rand() * 5), reps: ['8-10', '6-8', '12', '', 'AMRAP'][Math.floor(rand() * 5)], increment: [0, 1, 2, 2.5][Math.floor(rand() * 4)] };
  const mk = ()=> Array.from({ length:n }, ()=> ({ weight: rand() < 0.2 ? null : 20 + Math.floor(rand() * 20) * 2.5, reps: rand() < 0.1 ? null : 3 + Math.floor(rand() * 12) }));
  const l = mk(), p = rand() < 0.3 ? undefined : mk();
  const a = app.suggestProgression(ex, l, p), b = old.suggestProgression(ex, l, p);
  delete a.adjust; a.sets.forEach(x=> delete x.eased);
  if(JSON.stringify(a) !== JSON.stringify(b)) diff++;
}
if(old) eq(diff, 0, 'suggestProgression without context matches the previous version (3000 random cases)');
const snap = JSON.stringify(run.list);
app.exerciseSuggestion(drop, false, NOW, run.list); app.detectStall('Curl', run.list, { now: NOW });
eq(JSON.stringify(run.list), snap, 'session data not mutated');
const hist = [sess(9, 'Bench', four(80, 8)), sess(2, 'Bench', four(80, 9)), sess(5, 'Other', four(10, 9))];
app.__set('sessions', hist);
eq(app.findExerciseHistory('Bench').map(x=> x[0].reps), [9, 8], 'findExerciseHistory: last two sessions of this exercise, newest first');
if(old){ old.__set('sessions', hist); eq(app.findExerciseHistory('Bench'), old.findExerciseHistory('Bench'), 'findExerciseHistory unchanged'); }
eq(sug({ name:'New', sets:3, reps:'8-10' }, []).status, 'first', 'no history: first');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
