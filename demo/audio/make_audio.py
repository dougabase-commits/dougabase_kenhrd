"""Fable 5.2 showreel soundtrack — synthesized entirely with numpy. No samples."""
import json, sys, numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 44100; BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT; BARS = 27
N = int(BARS * BAR * SR); FPS = 30
rng = np.random.default_rng(52)
t_all = np.arange(N) / SR

def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, fc, order=2): return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)
def saw(f, n, ph=0.0): return 2 * ((f * np.arange(n) / SR + ph) % 1) - 1
def stereo(x, pan=0.0):
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)
def add(buf, x, t):
    i = int(t * SR)
    if i >= len(buf): return
    x = x[: len(buf) - i]; buf[i:i + len(x)] += x

# Am(add9)  Fmaj7  C(add9)  G   — one chord per bar
CHORDS = [[57, 60, 64, 71], [53, 57, 60, 64], [55, 60, 64, 67, 74], [55, 59, 62, 67]]
ROOTS = [33, 29, 36, 31]
SEC = dict(intro=(0, 4), tunnel=(4, 8), attractor=(8, 12), typo=(12, 16), making=(16, 20), finale=(20, 24), outro=(24, 27))
def sec_of(bar):
    for k, (a, b) in SEC.items():
        if a <= bar < b: return k

pad = np.zeros((N, 2)); arp = np.zeros((N, 2)); bass = np.zeros((N, 2)); drums = np.zeros((N, 2))
lead = np.zeros((N, 2)); fx = np.zeros((N, 2)); clap = np.zeros((N, 2))
kick_times = []

# ---- pad: 7-voice supersaw per note
for bar in range(BARS):
    ch = CHORDS[bar % 4] if bar < 24 else CHORDS[0]
    dur = BAR * (1.25 if bar < 24 else 3.4)
    if bar > 24: break
    n = int(dur * SR); x = np.zeros((n, 2))
    for m in ch:
        for d in np.linspace(-0.14, 0.14, 7):
            x += stereo(saw(mtof(m + d), n, rng.random()), rng.uniform(-0.9, 0.9))
    env = np.minimum(1, np.arange(n) / (0.25 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.5 * SR))
    s = sec_of(bar)
    fc = dict(intro=700 + 500 * bar, tunnel=2600, attractor=3600, typo=3000, making=1300, finale=5200, outro=3200)[s]
    add(pad, lp(x * env[:, None], fc) * 0.028, bar * BAR)

# ---- arp: 16th plucks with ping-pong delay
def pluck(m, dur=0.28, bright=1.0):
    n = int(dur * SR); f = mtof(m)
    x = saw(f, n) * 0.6 + np.sign(saw(f * 1.003, n)) * 0.25
    e = np.exp(-np.arange(n) / (0.07 * SR))
    y = lp(x, 900 + 5200 * bright) * e
    y[: 60] *= np.linspace(0, 1, 60)
    return y
ARP_PAT = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
for bar in range(24):
    s = sec_of(bar); ch = CHORDS[bar % 4]
    if s == 'typo': continue
    vol = dict(intro=0.25 + 0.12 * bar, tunnel=0.55, attractor=0.7, making=0.75, finale=0.8)[s]
    for i, k in enumerate(ARP_PAT):
        if s == 'intro' and i % 2 == 1 and bar < 2: continue
        m = ch[k % len(ch)] + 12 + (12 if (i % 8) in (3, 6) else 0)
        acc = 1.0 if i % 4 == 0 else 0.7
        add(arp, stereo(pluck(m, bright=vol) * 0.2 * vol * acc, 0.5 * np.sin(i * 1.7)), bar * BAR + i * BEAT / 4)
d = int(0.375 * SR)
for k in range(1, 6):
    g = 0.5 ** k
    sh = np.zeros_like(arp); sh[d * k:] = arp[:-d * k]
    if k % 2: sh = sh[:, ::-1]
    arp = arp + sh * g if k == 1 else arp + sh * g * 0.8

# ---- drums
def kick():
    n = int(0.42 * SR); tt = np.arange(n) / SR
    f = 46 + 130 * np.exp(-tt / 0.028)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.13)
    x += hp(rng.standard_normal(n), 3000) * np.exp(-tt / 0.004) * 0.25
    return np.tanh(x * 1.8) * 0.9
def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    return hp(rng.standard_normal(n), 7500, 4) * np.exp(-np.arange(n) / ((0.07 if open_ else 0.012) * SR))
def clap_():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    e = sum(np.exp(-np.maximum(tt - o, 0) / 0.012) * (tt >= o) for o in (0, 0.011, 0.023)) * 0.5 + np.exp(-tt / 0.09) * 0.5
    return bp(rng.standard_normal(n), 900, 4200) * e
K = kick()
for bar in range(4, 24):
    s = sec_of(bar)
    for b in range(4):
        t0 = bar * BAR + b * BEAT
        if s == 'making':
            if bar >= 18 and (b in (0, 2) or bar == 19):  # half-time build
                add(drums, stereo(K * 0.8), t0); kick_times.append(t0)
            if bar == 19:
                for q in range(4 if b < 2 else 8):
                    add(clap, stereo(clap_() * (0.12 + 0.05 * b)), t0 + q * BEAT / (4 if b < 2 else 8))
            add(drums, stereo(hat() * 0.10, 0.3), t0 + BEAT / 2)
            continue
        add(drums, stereo(K), t0); kick_times.append(t0)
        if s != 'tunnel' or bar >= 6:
            if b in (1, 3): add(clap, stereo(clap_() * 0.34), t0)
        add(drums, stereo(hat(True) * 0.17, 0.25), t0 + BEAT / 2)
        for q in (1, 3):
            add(drums, stereo(hat() * (0.12 if s != 'tunnel' else 0.07), -0.3), t0 + q * BEAT / 4)
        if s in ('typo', 'finale'): add(drums, stereo(hat() * 0.09, 0.1), t0)
    if s in ('typo', 'finale') and bar % 2 == 1:  # fill
        for q in (13, 14, 15): add(clap, stereo(clap_() * 0.2), bar * BAR + q * BEAT / 4)
        add(drums, stereo(K * 0.8), bar * BAR + 3.5 * BEAT)

# ---- bass: offbeat-driven saw + sub
BPAT = [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1]
for bar in range(4, 24):
    s = sec_of(bar); r = ROOTS[bar % 4]
    if s == 'making' and bar < 18:
        n = int(BAR * SR); e = np.minimum(1, np.arange(n) / 2000) * np.minimum(1, (n - np.arange(n)) / 4000)
        add(bass, stereo(np.sin(2 * np.pi * mtof(r) * np.arange(n) / SR) * e * 0.3), bar * BAR); continue
    for i, on in enumerate(BPAT):
        if not on: continue
        n = int(BEAT / 4 * 1.6 * SR); f = mtof(r + (12 if i in (6, 13) else 0))
        x = saw(f, n) * 0.5 + np.sin(2 * np.pi * f * np.arange(n) / SR)
        e = np.exp(-np.arange(n) / (0.16 * SR)); e[:80] *= np.linspace(0, 1, 80)
        add(bass, stereo(lp(x, 520 if s != 'finale' else 800) * e * 0.34), bar * BAR + i * BEAT / 4)

# ---- lead melody (8ths), attractor + finale
MEL = [[76, 0, 81, 0, 79, 76, 0, 72], [0, 69, 72, 0, 77, 76, 0, 72], [76, 0, 79, 0, 76, 74, 0, 72], [74, 0, 71, 0, 74, 79, 0, 83]]
def lead_note(m, dur):
    n = int(dur * SR); x = np.zeros(n)
    for d in (-0.09, 0, 0.09): x += saw(mtof(m + d), n, rng.random())
    x += np.sin(2 * np.pi * mtof(m + 12) * np.arange(n) / SR) * 0.6
    e = np.exp(-np.arange(n) / (0.22 * SR)) * np.minimum(1, np.arange(n) / 200)
    return lp(x, 4200) * e
for bar in list(range(8, 12)) + list(range(20, 24)):
    for i, m in enumerate(MEL[bar % 4]):
        if m: add(lead, stereo(lead_note(m, 0.5) * (0.10 if bar < 12 else 0.13), 0.15 * (-1) ** i), bar * BAR + i * BEAT / 2)
d2 = int(0.75 * BEAT * SR); sh = np.zeros_like(lead); sh[d2:] = lead[:-d2]; lead += sh[:, ::-1] * 0.4

# ---- fx: risers into each section, impacts at each section start
def riser(dur):
    n = int(dur * SR); x = rng.standard_normal(n); k = np.arange(n) / n
    lo, mid, hi = bp(x, 300, 1200), bp(x, 1200, 4500), bp(x, 4500, 12000)
    y = lo * np.clip(1 - 2 * k, 0, 1) + mid * (1 - np.abs(2 * k - 1)) + hi * np.clip(2 * k - 1, 0, 1)
    return y * k ** 2.2
def impact():
    n = int(3.0 * SR); tt = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-tt / 0.08)) / SR) * np.exp(-tt / 0.5)
    crash = hp(rng.standard_normal(n), 2500) * np.exp(-tt / 0.7) * 0.28
    return np.stack([boom + crash, boom + np.roll(crash, 300)], 1)
for bar, dur in ((3, 3.0), (4, 2), (8, 2), (12, 2), (16, 2), (20, 4), (24, 4)):
    if bar != 3: add(fx, stereo(riser(dur) * 0.2), bar * BAR - dur)
    add(fx, impact() * (0.55 if bar in (3, 20, 24) else 0.36), (3 * BAR if bar == 3 else bar * BAR))
add(fx, stereo(riser(5.5) * 0.14), 0.4)

# ---- sidechain + mix
duck = np.ones(N)
for kt in kick_times:
    i = int(kt * SR); n = int(0.36 * SR); seg = 1 - 0.72 * np.exp(-np.arange(n) / (0.11 * SR))
    j = min(N, i + n); duck[i:j] = np.minimum(duck[i:j], seg[: j - i])
duck = duck[:, None]
ir_n = int(2.8 * SR)
ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / (0.55 * SR))[:, None]; ir = hp(lp(ir, 7000), 250)
send = pad * 0.5 + arp * 0.6 + lead * 0.8 + clap * 0.5 + fx * 0.3
wet = np.stack([fftconvolve(send[:, c], ir[:, c])[:N] for c in (0, 1)], 1) * 0.016
mix = (pad * 1.0 + arp * 0.9 + bass) * duck + lead * (0.6 + 0.4 * duck) + drums + clap + fx + wet * (0.5 + 0.5 * duck)
mix = hp(mix, 28)
fade = np.clip((BARS * BAR - t_all) / 4.5, 0, 1) ** 1.5
mix *= fade[:, None]
mix = np.tanh(mix * 1.5); mix /= np.abs(mix).max() / 0.94
wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))

# ---- per-frame analysis for audio-reactive visuals
mono = mix.mean(1); F = int(BARS * BAR * FPS); W = 4096; win = np.hanning(W)
edges = np.geomspace(35, 16000, 49); freqs = np.fft.rfftfreq(W, 1 / SR)
bands, rms, kenv, wave = [], [], [], []
kt = np.array(kick_times)
for f in range(F):
    c = int(f / FPS * SR); seg = np.zeros(W); a = max(0, c - W // 2); b = min(N, c + W // 2)
    seg[: b - a] = mono[a:b]; sp = np.abs(np.fft.rfft(seg * win)) / W
    bands.append([float(np.sqrt((sp[(freqs >= lo) & (freqs < hi)] ** 2).sum() + 1e-12)) for lo, hi in zip(edges[:-1], edges[1:])])
    rms.append(float(np.sqrt((seg ** 2).mean())))
    past = kt[kt <= f / FPS + 1e-6]
    kenv.append(float(np.exp(-(f / FPS - past[-1]) / 0.14)) if len(past) else 0.0)
    w0 = mono[c: c + 1470 * 2: 21] if c + 2940 < N else np.zeros(140); wave.append([round(float(v), 3) for v in w0])
bands = np.array(bands); bands = np.clip((20 * np.log10(bands + 1e-9) + 78) / 60, 0, 1)
json.dump(dict(fps=FPS, frames=F, samples=N, sr=SR, bands=np.round(bands, 3).tolist(), rms=np.round(np.array(rms) / max(rms), 3).tolist(),
               kick=np.round(kenv, 3).tolist(), wave=wave), open(sys.argv[2], 'w'))
print('ok', N / SR, 'sec', len(kick_times), 'kicks')
