// SHORELINE — a raid on the coast, played as a patch.
//
// You spawn on the rocks below the resort. The sea is the clock: everything
// breathes with the swell. Open the Control panel to run the raid:
//   Storm    weather rolling in off the water
//   Stress   your pulse, and how often a marksman finds your treeline
//   Contact  the firefight on the resort balcony
//   Extract  hold it down until the boat arrives

$setTempo(84);

const raid = $cGroup('Raid');
const storm = $slider('Storm', 2, 0, 5, raid);
const stress = $slider('Stress', 1.5, 0, 5, raid);
const contact = $toggleBtn('Contact', false, raid);
const extract = $btn('Extract', raid);

// The valley between the hills and the water: one long reverb for all of it.
const valley = $bus((wet) => $reverb(wet, 3.5, { size: 4, tone: 2.5 })).out({
    gain: 2,
});

// ─── The sea ────────────────────────────────────────────────────────────────

const sea = $swell('0.07hz', { steepness: 3.5, chop: 2, seed: 7 });

$noise('pink')
    .lpf(sea.range('c5', 'c8'))
    .amp(sea.range(0.4, 4))
    .out({ label: 'surf', gain: 2, pan: sea._roll, sends: [valley, 1] });

$noise('brown')
    .lpf('110hz')
    .amp(sea._tilt.range(1, 4))
    .out({ label: 'undertow', gain: 2 });

// ─── Weather ────────────────────────────────────────────────────────────────

const gust = $lorenz({ rate: 0.15 });

$noise('white')
    .bpf(gust.range('c5', 'c7'), 4)
    .amp(storm.range(0, 2.5))
    .out({ label: 'wind', pan: gust._y, sends: [valley, 2] });

$mi.particles('c6', {
    density: storm.range(0.3, 4),
    resonance: 4,
    spread: 3,
})
    .amp(storm.range(0, 3))
    .out({ label: 'rain', gain: 1.5, sends: [valley, 1.5] });

// ─── The resort ─────────────────────────────────────────────────────────────

// An empty health spa on the hill, humming to itself.
$mi.modal('d1', {
    brightness: sea.range(0.5, 2),
    decay: 4,
    structure: 4,
}).out({ label: 'resort', gain: 1.5, sends: [valley, 2.5] });

$supersaw($chord('D2[m9]'), { detune: 0.25, unison: 5 })
    .lpf(sea.range('c3', 'c5'), 1)
    .amp(1.2)
    .out({ label: 'dread', gain: 1.5, sends: [valley, 2] });

// ─── You ────────────────────────────────────────────────────────────────────

const heartFilter = stress.range('90hz', '260hz');

$tr909
    .kick($`c [~ c] ~ ~`, { attack: 0, decay: 1.5, freq: '45hz' })
    .lpf(heartFilter)
    .amp(stress.range(1.5, 5))
    .out({ label: 'pulse', gain: 2.5 });

// Past the midpoint of Stress a second heart joins in at double time.
$tr909
    .kick($`[c [~ c] ~ ~]*2`, { attack: 0, decay: 1, freq: '50hz' })
    .lpf(heartFilter)
    .amp(stress.range(-5, 5).clamp({ max: 5, min: 0 }))
    .out({ label: 'panic', gain: 2 });

// Boots on shingle: a gritty scrape over a low thud, never quite regular.
const boots = $`c ~ c? ~ c ~ [c c]? ~`;

$noise('pink')
    .bpf('900hz', 2)
    .amp($perc(boots, { decay: 0.06 }))
    .out({ label: 'gravel', gain: 1.5, pan: -1 });

$sine('70hz')
    .amp($perc(boots, { decay: 0.04 }))
    .out({ label: 'boots', gain: 1.5, pan: -1 });

// ─── Everyone else ──────────────────────────────────────────────────────────

// One round at a time from somewhere up the hill, and the valley answering.
const shot = $noise('dust', { rate: stress.range('0.04hz', '0.5hz') });
const crack = $perc(shot, { decay: 0.35 });

$noise('white')
    .lpf(crack.range('c4', 'c9'), 1)
    .amp(crack)
    .overdrive(3)
    .out({ label: 'marksman', gain: 1.2, pan: 3, sends: [valley, 4] });

// Contact: automatic fire from the balcony, and something heavier replying.
const engaged = contact.slew({ fall: 0.3, rise: 0.05 });

$mi.snare('g2', {
    decay: 0.5,
    snappy: 4.5,
    tone: 1,
    trigger: $`[c*6]? ~ [c*4]?0.3 [c*8]?0.7`,
})
    .overdrive(3.5)
    .amp(engaged)
    .out({ label: 'balcony', gain: 1.5, pan: 2, sends: [valley, 3] });

$tr909
    .kick($`~ [c*3]? ~ [c c]?`, { decay: 0.5, freq: '70hz' })
    .overdrive(2.5, { mode: 'asym' })
    .amp(engaged)
    .out({ label: 'reply', gain: 1.5, pan: -3, sends: [valley, 3] });

// A handset left on a table, spelling out where you are: S-H-O-R-E.
const callsign = $`<18 7 14 17 4> ~ ~ ~`;

$mi.speak('c2', { bank: 3, speed: 3, trigger: callsign, word: callsign })
    .bpf('1500hz', 2)
    .quantNoise(3)
    .out({ label: 'radio', gain: 1.5, pan: -2, sends: [valley, 1] });

$noise('white').bpf('2500hz', 1).amp(0.12).out({ label: 'static', pan: -2 });

// ─── Extract ────────────────────────────────────────────────────────────────

// Hold the button: the boat's engine fades in under a chord that finally
// resolves. Let go too early and it turns back.
const boat = $adsr(extract, { attack: 4, release: 3, sustain: 5 });

$noise('brown')
    .amp($pulse('11hz').range(0, 5))
    .lpf(boat.range('80hz', '400hz'))
    .amp(boat)
    .out({ label: 'engine', gain: 2 });

$supersaw($chord('D3[maj9]'), { detune: 0.3 })
    .lpf(boat.range('c3', 'c7'), 1)
    .amp(boat)
    .out({ label: 'safe', gain: 1.5, sends: [valley, 3] });

$setEndOfChainCb((mix) => mix.comp({ ratio: 3, threshold: 3 }));
