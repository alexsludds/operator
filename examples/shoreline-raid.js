// KELP POINT — the sound of a raid on the coast.
//
// Press Play Raid and the game plays this patch: every shot, footstep and
// hit below is a button the raid presses, and the weather, your pulse and
// the firefight are sliders it rides. Open the Control panel to play it by
// hand instead.

$setTempo(96);

const raid = $cGroup('Raid');
const storm = $slider('Storm', 2, 0, 5, raid);
const stress = $slider('Stress', 1.5, 0, 5, raid);
// Where incoming fire comes from: left to right, and near to far.
const bearing = $slider('Bearing', 0, -5, 5, raid);
const range = $slider('Range', 2, 0, 5, raid);
const contact = $toggleBtn('Contact', false, raid);
const indoors = $toggleBtn('Indoors', false, raid);
const extract = $btn('Extract', raid);

const hits = $cGroup('Hits', { group: raid });
const shot = $btn('Shot', hits);
const incoming = $btn('Incoming', hits);
const step = $btn('Step', hits);
const hurt = $btn('Hurt', hits);
const loot = $btn('Loot', hits);
const kill = $btn('Kill', hits);
const blast = $btn('Blast', hits);
const thunder = $btn('Thunder', hits);
const reload = $btn('Reload', hits);
const spotted = $btn('Spotted', hits);

// The valley between the hills and the water: one long reverb for all of it.
const valley = $bus((wet) => $reverb(wet, 3.5, { size: 4, tone: 2.5 })).out({
    gain: 2,
});

// Walls between you and the weather: 5 V outdoors, falling as you go inside.
const roof = indoors.slew({ fall: 0.25, rise: 0.25 });
const open = roof.range('c9', 'c4', 0, 5);
const air = roof.range(5, 2, 0, 5);

// ─── The sea and the weather ────────────────────────────────────────────────

const sea = $swell('0.07hz', { chop: 2, seed: 7, steepness: 3.5 });

$noise('pink')
    .lpf(sea.range('c5', 'c8'))
    .lpf(open)
    .amp(sea.range(0.4, 4))
    .amp(air)
    .out({ gain: 2, label: 'surf', pan: sea._roll, sends: [valley, 1] });

$noise('brown')
    .lpf('110hz')
    .amp(sea._tilt.range(1, 4))
    .out({ gain: 2, label: 'undertow' });

const gust = $lorenz({ rate: 0.15 });

$noise('white')
    .bpf(gust.range('c5', 'c7'), 4)
    .lpf(open)
    .amp(storm.range(0, 2.5))
    .out({ label: 'wind', pan: gust._y, sends: [valley, 2] });

$mi.particles('c6', { density: storm.range(0.3, 4), resonance: 4, spread: 3 })
    .lpf(open)
    .amp(storm.range(0, 3))
    .out({ gain: 1.5, label: 'rain', sends: [valley, 1.5] });

const rumble = $adsr(thunder.hold(0.4), { attack: 0.08, release: 3.5 });

$noise('brown')
    .lpf(rumble.range('40hz', '500hz'))
    .amp(rumble)
    .overdrive(2)
    .out({ gain: 2.5, label: 'thunder', sends: [valley, 4] });

// ─── Dread ──────────────────────────────────────────────────────────────────

$mi.modal('d1', {
    brightness: stress.range(0.3, 2.5),
    decay: 4,
    structure: 4,
}).out({
    gain: 1.5,
    label: 'hotel',
    sends: [valley, 2.5],
});

$supersaw($chord('D2[m9]'), { detune: 0.25, unison: 5 })
    .lpf(stress.range('c3', 'c6'), 1)
    .amp(1.2)
    .out({ gain: 1.5, label: 'dread', sends: [valley, 2] });

const heartFilter = stress.range('90hz', '260hz');

$tr909
    .kick($`c [~ c] ~ ~`, { attack: 0, decay: 1.5, freq: '45hz' })
    .lpf(heartFilter)
    .amp(stress.range(1, 5))
    .out({ gain: 2.5, label: 'pulse' });

// Past the midpoint of Stress a second heart joins in at double time.
$tr909
    .kick($`[c [~ c] ~ ~]*2`, { attack: 0, decay: 1, freq: '50hz' })
    .lpf(heartFilter)
    .amp(stress.range(-5, 5).clamp({ max: 5, min: 0 }))
    .out({ gain: 2, label: 'panic' });

const spot = $perc(spotted, { decay: 0.9 });

$supersaw(['d4', 'eb4', 'ab4'], { detune: 0.4 })
    .lpf(spot.range('c4', 'c8'), 2)
    .amp(spot)
    .out({ gain: 1.5, label: 'spotted', sends: [valley, 3] });

// ─── The firefight ──────────────────────────────────────────────────────────

const engaged = contact.slew({ fall: 0.5, rise: 0.05 });
const riff = $`d1 d1 [f1 d1] d1 a1 d1 [c2 d1] ab1`;

$saw(riff)
    .lpf($perc(riff, { decay: 0.12 }).range('c3', 'c6'), 3)
    .overdrive(2)
    .amp(engaged)
    .out({ gain: 2, label: 'riff' });

$tr909
    .kick($`c ~ ~ c ~ ~ c ~`, { decay: 2 })
    .amp(engaged)
    .out({ gain: 2, label: 'drive' });

$noise('white')
    .hpf('6000hz')
    .amp($perc($`c*16`, { decay: 0.02 }))
    .amp(engaged)
    .out({ gain: 1, label: 'ticks', pan: 1 });

// ─── What the raid presses ──────────────────────────────────────────────────

// Your rifle: a bright crack over a short thump.
const crack = $perc(shot, { decay: 0.09 });

$noise('white')
    .lpf(crack.range('c6', 'c10'))
    .amp(crack)
    .overdrive(3.5)
    .out({ gain: 1.6, label: 'rifle', sends: [valley, 2.5] });

$sine($perc(shot, { decay: 0.05 }).range('45hz', '170hz'))
    .amp($perc(shot, { decay: 0.11 }))
    .out({ gain: 2.5, label: 'recoil' });

// Their fire: duller and wetter the farther off it is, from where it is.
const report = $perc(incoming, { decay: 0.14 });

$noise('white')
    .lpf(range.range('c9', 'c5'))
    .amp(report)
    .overdrive(2.5)
    .amp(range.range(5, 1.2))
    .out({ gain: 1.5, label: 'incoming', pan: bearing, sends: [valley, 4] });

// Boots: shingle outside, floorboards inside.
const tread = $perc(step, { decay: 0.05 });

$noise('pink')
    .bpf(roof.range('900hz', '320hz', 0, 5), 2)
    .amp(tread)
    .out({ gain: 3, label: 'boots' });

$sine('70hz')
    .amp($perc(step, { decay: 0.04 }))
    .out({ gain: 2.5, label: 'heel' });

const pain = $perc(hurt, { decay: 0.25 });

$noise('brown').amp(pain).overdrive(4).out({ gain: 2, label: 'hit' });

$sine('b6')
    .amp($perc(hurt, { decay: 1.6 }))
    .out({ gain: 0.5, label: 'ringing', pan: bearing });

$mi.modal(['e5', 'b5'], {
    brightness: 3,
    decay: 2.5,
    structure: 1.4,
    trigger: loot,
}).out({
    gain: 1.2,
    label: 'loot',
    sends: [valley, 2],
});

const fall = $perc(kill, { decay: 0.5 });

$sine(fall.range('c2', 'c4')).amp(fall).out({ gain: 1.5, label: 'kill' });

const boom = $perc(blast, { decay: 0.9 });

$noise('white')
    .lpf(boom.range('60hz', '6000hz'))
    .amp(boom)
    .overdrive(4)
    .out({ gain: 2.5, label: 'blast', sends: [valley, 4] });

$sine($perc(blast, { decay: 0.3 }).range('30hz', '120hz'))
    .amp($perc(blast, { decay: 0.7 }))
    .out({ gain: 3, label: 'shock' });

$noise('white')
    .bpf('3200hz', 3)
    .amp($perc(reload, { decay: 0.025 }))
    .out({ gain: 1.5, label: 'reload' });

// A handset left on a table, spelling out where you are: S-H-O-R-E.
const callsign = $`<18 7 14 17 4> ~ ~ ~`;

$mi.speak('c2', { bank: 3, speed: 3, trigger: callsign, word: callsign })
    .bpf('1500hz', 2)
    .quantNoise(3)
    .out({ gain: 1, label: 'radio', pan: -2, sends: [valley, 1] });

// ─── Extract ────────────────────────────────────────────────────────────────

// Hold the zone: the boat's engine fades in under a chord that finally
// resolves. Leave too early and it turns back.
const boat = $adsr(extract, { attack: 6, release: 3, sustain: 5 });

$noise('brown')
    .amp($pulse('11hz').range(0, 5))
    .lpf(boat.range('80hz', '400hz'))
    .amp(boat)
    .out({ gain: 2, label: 'engine' });

$supersaw($chord('D3[maj9]'), { detune: 0.3 })
    .lpf(boat.range('c3', 'c7'), 1)
    .amp(boat)
    .out({ gain: 1.5, label: 'safe', sends: [valley, 3] });

$setEndOfChainCb((mix) => mix.comp({ ratio: 3, threshold: 3 }));
