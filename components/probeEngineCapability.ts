// D3/D6（spec docs/superpowers/specs/2026-07-13-geo-branded-unbranded-redesign.md）：
// 展示层专用的引擎联网能力判定 + branded 回答五态分类。
//
// Wave 3 收口：真源已统一到 lib/probes/engine-capability.ts（此前 summary.ts / geo.ts /
// 本文件各自维护一份，行为可能悄悄漂移）。本文件仅做 re-export，保留原 import 路径，
// 避免变更 PresenceMap 等既有调用方。
export {
  resolveWebSearchEnabled,
  classifyBrandedAnswer,
  type BrandedAnswerState,
  type ClassifiableAnswer,
} from '@/lib/probes/engine-capability'
