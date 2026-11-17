'use strict';

// V-160HD のオーディオ入力（LAN/RS-232 Basic control commands の IAL/IAM/IAS の引数）
// 参考: Roland "LAN/RS-232 Basic Control Commands" / "V-160HD Remote Control Guide"
const INPUTS = [
  { id: 'XLR1', label: 'AUDIO 1', meter: ['IN-XLR1'] },
  { id: 'XLR2', label: 'AUDIO 2', meter: ['IN-XLR2'] },
  { id: 'RCA1', label: 'AUDIO 3/4', meter: ['IN-RCA1-L', 'IN-RCA1-R'] },
  { id: 'USB', label: 'USB IN', meter: ['IN-USB-L', 'IN-USB-R'] },
  { id: 'BLUETOOTH', label: 'Bluetooth', meter: ['IN-BLUETOOTH-L', 'IN-BLUETOOTH-R'] },
];
for (let i = 1; i <= 8; i++) {
  INPUTS.push({ id: `HDMI${i}`, label: `HDMI ${i}`, meter: [`IN-HDMI${i}-L`, `IN-HDMI${i}-R`] });
}
for (let i = 1; i <= 8; i++) {
  INPUTS.push({ id: `SDI${i}`, label: `SDI ${i}`, meter: [`IN-SDI${i}-L`, `IN-SDI${i}-R`] });
}

// 出力（OAL/OAM の引数）
const OUTPUTS = [
  { id: 'MAIN', label: 'MAIN', meter: ['OUT-MAIN-L', 'OUT-MAIN-R'] },
  { id: 'AUX1', label: 'AUX 1', meter: ['OUT-AUX1-L', 'OUT-AUX1-R'] },
  { id: 'AUX2', label: 'AUX 2', meter: ['OUT-AUX2-L', 'OUT-AUX2-R'] },
  { id: 'AUX3', label: 'AUX 3', meter: ['OUT-AUX3-L', 'OUT-AUX3-R'] },
  { id: 'USB', label: 'USB OUT', meter: ['OUT-USB-L', 'OUT-USB-R'] },
];

// MTRLV の並び順（V-160HD: a0–a53）。接続時に MTRCH で実機から取り直し、取れなければこれを使う。
const DEFAULT_METER_ORDER = [
  'IN-XLR1', 'IN-XLR2', 'IN-RCA1-L', 'IN-RCA1-R', 'IN-USB-L', 'IN-USB-R',
  'IN-BLUETOOTH-L', 'IN-BLUETOOTH-R',
];
for (let i = 1; i <= 8; i++) DEFAULT_METER_ORDER.push(`IN-HDMI${i}-L`, `IN-HDMI${i}-R`);
for (let i = 1; i <= 8; i++) DEFAULT_METER_ORDER.push(`IN-SDI${i}-L`, `IN-SDI${i}-R`);
DEFAULT_METER_ORDER.push('OUT-MAIN-L', 'OUT-MAIN-R');
for (let i = 1; i <= 3; i++) DEFAULT_METER_ORDER.push(`OUT-AUX${i}-L`, `OUT-AUX${i}-R`);
DEFAULT_METER_ORDER.push('OUT-USB-L', 'OUT-USB-R');
for (let i = 1; i <= 2; i++) DEFAULT_METER_ORDER.push(`OUT-DSK${i}-L`, `OUT-DSK${i}-R`);

// 16 フェーダーの初期割り当て
const DEFAULT_STRIPS = [
  'XLR1', 'XLR2', 'RCA1', 'USB',
  'HDMI1', 'HDMI2', 'HDMI3', 'HDMI4', 'HDMI5', 'HDMI6', 'HDMI7', 'HDMI8',
  'SDI1', 'SDI2', 'SDI3', 'SDI4',
];

const LEVEL_MIN = -800; // -80.0dB（単位は 0.1dB）
const LEVEL_MAX = 100; // +10.0dB
const NEG_INF = '-INF';

module.exports = { INPUTS, OUTPUTS, DEFAULT_METER_ORDER, DEFAULT_STRIPS, LEVEL_MIN, LEVEL_MAX, NEG_INF };
