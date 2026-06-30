<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Veris · SEO+GEO 诊断助手 · UI 原型</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#EEF2F4; --surface:#FFFFFF; --surface-2:#F5F8F9;
  --ink:#15191F; --ink-soft:#5C6672; --ink-faint:#8B96A3;
  --line:#D9E0E6; --line-soft:#E8EDF1;
  --measured:#0B6E74;   /* 实测 */
  --measured-bg:#E2F1F1;
  --inferred:#B26B16;   /* 推断 */
  --inferred-bg:#F7EEDF;
  --gap:#B23A48;        /* 差距/竞品有你没有 */
  --gap-bg:#F8E7E9;
  --good:#2E7D56;       /* 已具备 */
  --good-bg:#E3F1E9;
  --radius:10px;
  --display:'Space Grotesk','Noto Sans SC',sans-serif;
  --body:'Inter','Noto Sans SC',sans-serif;
  --mono:'JetBrains Mono','Noto Sans SC',monospace;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--paper);color:var(--ink);font-family:var(--body);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--display);margin:0;font-weight:600;letter-spacing:-.01em}
.mono{font-family:var(--mono)}
button{font-family:var(--body);cursor:pointer}
a{color:var(--measured)}

/* ---- shell ---- */
.shell{max-width:1120px;margin:0 auto;padding:0 20px 64px}
.topbar{display:flex;align-items:center;gap:16px;padding:18px 0 16px;flex-wrap:wrap}
.brand{display:flex;align-items:baseline;gap:9px}
.brand .logo{font-family:var(--display);font-weight:700;font-size:20px;letter-spacing:-.02em}
.brand .logo b{color:var(--measured)}
.brand .sub{font-size:11px;color:var(--ink-faint);letter-spacing:.04em;text-transform:uppercase}
.target{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink-soft)}
.target .dom{font-family:var(--mono);color:var(--ink);background:var(--surface);border:1px solid var(--line);padding:4px 9px;border-radius:7px}
.ghost{background:var(--surface);border:1px solid var(--line);color:var(--ink);padding:6px 12px;border-radius:7px;font-size:13px}
.ghost:hover{border-color:var(--ink-soft)}

/* ---- stepper ---- */
.stepper{display:flex;gap:4px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:5px;margin-bottom:22px;overflow:auto}
.step{flex:1;min-width:120px;border:0;background:transparent;color:var(--ink-soft);padding:10px 12px;border-radius:8px;display:flex;align-items:center;gap:9px;font-size:13.5px;white-space:nowrap}
.step .n{font-family:var(--mono);font-size:12px;width:20px;height:20px;display:grid;place-items:center;border-radius:6px;background:var(--surface-2);border:1px solid var(--line)}
.step:hover{color:var(--ink)}
.step.active{background:var(--ink);color:#fff}
.step.active .n{background:rgba(255,255,255,.16);border-color:transparent;color:#fff}

/* ---- generic card ---- */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.screen{display:none}
.screen.show{display:block;animation:fade .25s ease}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.sec-h{display:flex;align-items:center;gap:10px;margin:26px 0 12px}
.sec-h h2{font-size:15px}
.sec-h .meta{margin-left:auto;font-size:12px;color:var(--ink-faint)}
.hr{height:1px;background:var(--line-soft);border:0;margin:0}

/* ---- provenance tag (signature) ---- */
.tag{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:10.5px;font-weight:500;padding:2px 7px;border-radius:999px;letter-spacing:.02em;vertical-align:middle}
.tag .dot{width:6px;height:6px;border-radius:50%}
.tag.m{background:var(--measured-bg);color:var(--measured)} .tag.m .dot{background:var(--measured)}
.tag.i{background:var(--inferred-bg);color:var(--inferred)} .tag.i .dot{background:var(--inferred)}
.tag.g{background:var(--gap-bg);color:var(--gap)} .tag.g .dot{background:var(--gap)}
.tag.ok{background:var(--good-bg);color:var(--good)} .tag.ok .dot{background:var(--good)}

/* ---- step1 new analysis ---- */
.intro{font-size:13px;color:var(--ink-soft);max-width:620px;margin:2px 0 22px}
.field{margin-bottom:18px}
.field label{display:block;font-size:12.5px;font-weight:500;margin-bottom:7px;color:var(--ink-soft)}
.url-in{width:100%;font-family:var(--mono);font-size:16px;padding:15px 16px;border:1.5px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink)}
.url-in:focus{outline:none;border-color:var(--measured)}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.sel,.txt{width:100%;font-family:var(--body);font-size:14px;padding:11px 12px;border:1.5px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)}
.sel:focus,.txt:focus{outline:none;border-color:var(--measured)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:flex;align-items:center;gap:7px;border:1.5px solid var(--line);background:var(--surface);border-radius:8px;padding:8px 12px;font-size:13px;color:var(--ink)}
.chip input{accent-color:var(--measured)}
.chip.on{border-color:var(--measured);background:var(--measured-bg);color:var(--measured)}
.toggle-row{display:flex;align-items:center;gap:12px;padding:13px 14px;border:1.5px solid var(--line);border-radius:9px;background:var(--surface-2)}
.toggle-row .t{font-size:13px}.toggle-row .d{font-size:12px;color:var(--ink-soft)}
.run-btn{margin-top:24px;background:var(--ink);color:#fff;border:0;padding:14px 26px;border-radius:10px;font-size:14px;font-weight:600;font-family:var(--display)}
.run-btn:hover{background:#000}

/* ---- step2 stat strip ---- */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stat{padding:15px 16px}
.stat .k{font-size:12px;color:var(--ink-soft);margin-bottom:8px}
.stat .v{font-family:var(--display);font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1}
.stat .v small{font-size:14px;color:var(--ink-faint);font-weight:500}
.stat .b{margin-top:9px}

/* ---- answer presence map ---- */
.map-wrap{padding:16px}
.map{display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-top:4px}
.cell{aspect-ratio:1;border-radius:6px;background:var(--surface-2);border:1px solid var(--line);position:relative}
.cell.on{background:var(--measured);border-color:var(--measured)}
.cell:focus,.cell:hover{outline:2px solid var(--ink);outline-offset:1px}
.legend{display:flex;gap:18px;font-size:12px;color:var(--ink-soft);margin-top:13px;align-items:center}
.legend .sw{width:11px;height:11px;border-radius:3px;display:inline-block;margin-right:6px;vertical-align:-1px}
.tip{position:fixed;background:var(--ink);color:#fff;font-size:12px;padding:6px 9px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity .12s;max-width:240px;z-index:50}

/* ---- competitor SoV ---- */
.sov{padding:16px}
.sov-row{display:grid;grid-template-columns:120px 1fr 52px;align-items:center;gap:12px;margin:11px 0}
.sov-row .nm{font-size:13px}
.sov-row .nm.you{font-weight:600;color:var(--measured)}
.bar{height:11px;border-radius:6px;background:var(--surface-2);overflow:hidden}
.bar>i{display:block;height:100%;border-radius:6px;background:var(--ink-soft)}
.bar.you>i{background:var(--measured)}
.sov-row .pct{font-family:var(--mono);font-size:12.5px;text-align:right;color:var(--ink-soft)}

/* ---- findings ---- */
.tabs{display:inline-flex;gap:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:4px;margin-bottom:6px}
.tab{border:0;background:transparent;padding:7px 14px;border-radius:6px;font-size:13px;color:var(--ink-soft)}
.tab.active{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.05)}
.find{border-bottom:1px solid var(--line-soft)}
.find:last-child{border-bottom:0}
.find-head{display:flex;align-items:center;gap:11px;padding:14px 16px;width:100%;border:0;background:transparent;text-align:left}
.find-head:hover{background:var(--surface-2)}
.sev{width:8px;height:8px;border-radius:50%;flex:none}
.sev.hi{background:var(--gap)}.sev.mid{background:var(--inferred)}.sev.ok{background:var(--good)}
.find-title{flex:1;font-size:13.5px;color:var(--ink)}
.find-conf{font-family:var(--mono);font-size:11px;color:var(--ink-faint)}
.chev{color:var(--ink-faint);transition:transform .2s;font-size:12px}
.find.open .chev{transform:rotate(90deg)}
.evidence{display:none;padding:0 16px 16px 35px}
.find.open .evidence{display:block}
.ev-label{font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 8px}
.ev-box{background:var(--surface-2);border:1px solid var(--line);border-radius:9px;padding:13px 14px;font-size:12.5px}
.ev-box.code{font-family:var(--mono);font-size:12px;color:var(--ink-soft);white-space:pre-wrap;line-height:1.7}
.ev-box .hl{background:var(--gap-bg);color:var(--gap);padding:0 3px;border-radius:3px}
.ev-box .nameyou{background:var(--measured-bg);color:var(--measured);padding:0 3px;border-radius:3px}
.cites{margin-top:10px}
.cite{display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:11.5px;color:var(--ink-soft);padding:4px 0}
.cite .i{color:var(--ink-faint)}
.gtable{width:100%;border-collapse:collapse;font-size:12px}
.gtable th,.gtable td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
.gtable th{color:var(--ink-faint);font-weight:500}
.gtable td.n{font-family:var(--mono)}

/* ---- step3 recommendation cards ---- */
.rec{padding:0;margin-bottom:14px;overflow:hidden}
.rec-top{display:flex;align-items:flex-start;gap:12px;padding:16px 16px 12px}
.prio{font-family:var(--mono);font-size:11px;font-weight:500;padding:3px 8px;border-radius:6px;background:var(--ink);color:#fff;flex:none}
.prio.p2{background:var(--ink-soft)}
.rec-top h3{font-size:14.5px;flex:1}
.rec-actions{display:flex;gap:6px;flex:none}
.act{border:1px solid var(--line);background:var(--surface);border-radius:7px;padding:6px 11px;font-size:12.5px;color:var(--ink-soft)}
.act:hover{border-color:var(--ink-soft);color:var(--ink)}
.act.acc.on{background:var(--good-bg);border-color:var(--good);color:var(--good)}
.act.rej.on{background:var(--gap-bg);border-color:var(--gap);color:var(--gap)}
.rec-body{padding:0 16px 16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field-block .fb-l{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint);margin-bottom:5px;display:flex;align-items:center;gap:7px}
.field-block p{margin:0;font-size:13px;color:var(--ink);line-height:1.6}
.field-block.full{grid-column:1/-1}
.ev-ref{font-size:12.5px;color:var(--measured);background:var(--measured-bg);border:1px solid #cfe6e6;border-radius:8px;padding:9px 11px;font-family:var(--body)}
.editing{background:var(--inferred-bg);border-color:var(--inferred)}
.edit-note{font-size:12px;color:var(--inferred);padding:0 16px 14px;display:flex;align-items:center;gap:7px}
.edit-area{width:100%;min-height:62px;border:1.5px solid var(--inferred);border-radius:8px;padding:9px 11px;font-family:var(--body);font-size:13px;background:var(--surface)}

/* ---- step4 output ---- */
.out-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.prompt-card{padding:0;margin-bottom:14px;overflow:hidden}
.pc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line-soft)}
.pc-head .for{font-size:12.5px;color:var(--ink-soft);flex:1}
.copy{background:var(--measured);color:#fff;border:0;border-radius:7px;padding:7px 14px;font-size:12.5px;font-weight:500}
.copy.done{background:var(--good)}
.prompt-body{font-family:var(--mono);font-size:11.5px;line-height:1.7;color:var(--ink-soft);padding:13px 14px;background:var(--surface-2);white-space:pre-wrap;max-height:260px;overflow:auto}
.report{padding:18px;position:sticky;top:14px}
.report h2{font-size:15px;margin-bottom:4px}
.report .rmeta{font-size:12px;color:var(--ink-faint);margin-bottom:14px}
.rsec{padding:11px 0;border-bottom:1px solid var(--line-soft)}
.rsec:last-of-type{border-bottom:0}
.rsec .rt{font-size:13px;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:8px}
.rsec .rd{font-size:12.5px;color:var(--ink-soft)}
.export{margin-top:16px;width:100%;background:var(--ink);color:#fff;border:0;padding:12px;border-radius:9px;font-size:13.5px;font-weight:600;font-family:var(--display)}

.note{font-size:12px;color:var(--ink-faint);margin-top:18px;padding:11px 14px;background:var(--surface);border:1px dashed var(--line);border-radius:9px}
@media(max-width:780px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .row2,.rec-body,.out-grid{grid-template-columns:1fr}
  .map{grid-template-columns:repeat(8,1fr)}
  .report{position:static}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="shell">
  <div class="topbar">
    <div class="brand">
      <span class="logo">Ver<b>i</b>s</span>
      <span class="sub">SEO · GEO 诊断台</span>
    </div>
    <div class="target">
      <span>分析目标</span>
      <span class="dom">teamflow.cn</span>
      <button class="ghost">重新诊断</button>
    </div>
  </div>

  <div class="stepper" role="tablist">
    <button class="step" data-s="1" role="tab"><span class="n">1</span>新建分析</button>
    <button class="step active" data-s="2" role="tab"><span class="n">2</span>诊断</button>
    <button class="step" data-s="3" role="tab"><span class="n">3</span>优化建议</button>
    <button class="step" data-s="4" role="tab"><span class="n">4</span>输出</button>
  </div>

  <!-- ================= STEP 1 ================= -->
  <section class="screen" data-screen="1">
    <p class="intro">输入一个网址，Veris 会用真实数据（你的 GSC、各家 AI 的实测回答、页面抓取）做出 SEO + GEO 诊断——每条结论都附可复核的证据。</p>
    <div class="card" style="padding:22px">
      <div class="field">
        <label>网址</label>
        <input class="url-in" value="https://teamflow.cn" aria-label="网址">
      </div>
      <div class="row2">
        <div class="field">
          <label>行业 / 垂直</label>
          <select class="sel"><option>B2B SaaS · 项目协作</option><option>跨境电商</option><option>本地服务</option><option>其他…</option></select>
        </div>
        <div class="field">
          <label>市场 / 语言</label>
          <select class="sel"><option>中文 · 中国大陆</option><option>English · Global</option><option>东南亚</option></select>
        </div>
      </div>
      <div class="field">
        <label>竞品（自动检测，可手动增删）</label>
        <input class="txt" value="Asana, Monday.com, Notion（自动检测到 3 个，可编辑）">
      </div>
      <div class="field">
        <label>探测引擎（GEO 可见度实测来源）</label>
        <div class="chips">
          <label class="chip on"><input type="checkbox" checked>ChatGPT</label>
          <label class="chip on"><input type="checkbox" checked>Perplexity</label>
          <label class="chip on"><input type="checkbox" checked>Gemini</label>
          <label class="chip"><input type="checkbox">Google AI Overviews</label>
        </div>
      </div>
      <div class="field">
        <label>真实数据源</label>
        <div class="toggle-row">
          <input type="checkbox" checked style="accent-color:var(--measured);width:17px;height:17px">
          <div><div class="t">连接 Google Search Console（只读）</div><div class="d">接入后可看到你的真实排名、展示、点击——诊断最准的地面实况</div></div>
        </div>
      </div>
      <button class="run-btn">开始诊断 →</button>
    </div>
    <div class="note">示例界面。诊断为异步过程：跑完一个提问就在下一屏渐进显示一条结果，无需空等。</div>
  </section>

  <!-- ================= STEP 2 DIAGNOSIS ================= -->
  <section class="screen show" data-screen="2">
    <div class="sec-h"><h2>现状（客观真实数据）</h2><span class="meta">实测于 2026-06-29 · ChatGPT/Perplexity/Gemini 各跑 5 次 · 方向性样本</span></div>
    <div class="stats">
      <div class="card stat"><div class="k">AI 可见度</div><div class="v">6<small> / 20 提问</small></div><div class="b"><span class="tag m"><span class="dot"></span>样本实测</span></div></div>
      <div class="card stat"><div class="k">平均自然排名</div><div class="v">14.2<small> 位</small></div><div class="b"><span class="tag m"><span class="dot"></span>GSC 实测</span></div></div>
      <div class="card stat"><div class="k">可被 AI 抓取的页面</div><div class="v">62<small>%</small></div><div class="b"><span class="tag m"><span class="dot"></span>抓取实测</span></div></div>
      <div class="card stat"><div class="k">竞品平均可见度</div><div class="v">11<small> / 20</small></div><div class="b"><span class="tag i"><span class="dot"></span>推断·样本</span></div></div>
    </div>

    <div class="sec-h"><h2>答案出现地图</h2><span class="meta">20 个高购买意图提问 · 青=你出现 / 灰=你缺席</span></div>
    <div class="card map-wrap">
      <div class="map" id="map"></div>
      <div class="legend">
        <span><span class="sw" style="background:var(--measured)"></span>你出现（6）</span>
        <span><span class="sw" style="background:var(--surface-2);border:1px solid var(--line)"></span>你缺席（14）</span>
        <span style="color:var(--ink-faint)">悬停查看具体提问</span>
      </div>
    </div>

    <div class="sec-h"><h2>竞品可见度对比（Share of Voice）</h2></div>
    <div class="card sov">
      <div class="sov-row"><span class="nm you">teamflow（你）</span><div class="bar you"><i style="width:30%"></i></div><span class="pct">30%</span></div>
      <div class="sov-row"><span class="nm">Asana</span><div class="bar"><i style="width:70%"></i></div><span class="pct">70%</span></div>
      <div class="sov-row"><span class="nm">Notion</span><div class="bar"><i style="width:55%"></i></div><span class="pct">55%</span></div>
      <div class="sov-row"><span class="nm">Monday.com</span><div class="bar"><i style="width:45%"></i></div><span class="pct">45%</span></div>
    </div>

    <div class="sec-h"><h2>问题清单</h2><span class="meta">点开任意一条查看原始证据</span></div>
    <div style="margin-bottom:12px"><div class="tabs"><button class="tab active">GEO（10）</button><button class="tab">SEO（8）</button></div></div>
    <div class="card" id="findings">

      <div class="find open">
        <button class="find-head" aria-expanded="true">
          <span class="sev hi"></span>
          <span class="find-title">在「适合小团队的项目管理工具推荐」样本探针中，你未被提及，竞品 Asana / Notion 多次出现</span>
          <span class="tag g"><span class="dot"></span>差距</span>
          <span class="find-conf">置信 高</span>
          <span class="chev">▶</span>
        </button>
        <div class="evidence">
          <div class="ev-label">证据 · ChatGPT 实测回答原文（第 3/5 次）</div>
          <div class="ev-box">面向小团队，常被推荐的项目管理工具包括 <span class="hl">Asana</span>（上手快、免费档够用）、<span class="hl">Notion</span>（文档与任务一体）、以及 Trello 的看板模式……（全文未出现 <span class="nameyou">teamflow</span>）</div>
          <div class="ev-label" style="margin-top:14px">被引用的来源（你可自行复核）</div>
          <div class="cites">
            <div class="cite"><span class="i">↳</span> zhihu.com/question/･･･ 「2026 小团队协作工具横评」</div>
            <div class="cite"><span class="i">↳</span> asana.com/zh/use-cases/small-teams</div>
            <div class="cite"><span class="i">↳</span> sspai.com/post/･･･ 「我们团队为什么选 Notion」</div>
          </div>
        </div>
      </div>

      <div class="find open">
        <button class="find-head" aria-expanded="true">
          <span class="sev hi"></span>
          <span class="find-title">核心落地页 /features 内容靠 JS 渲染，非渲染抓取链路读不到初始正文</span>
          <span class="tag m"><span class="dot"></span>实测</span>
          <span class="find-conf">置信 高</span>
          <span class="chev">▶</span>
        </button>
        <div class="evidence">
          <div class="ev-label">证据 · 页面抓取对比</div>
          <div class="ev-box code">GET /features  （服务端 HTML，关闭 JS）
> 正文文本量：<span class="hl">0 字</span>（仅导航与页脚）
> 主要内容节点：&lt;div id="app"&gt;&lt;/div&gt;（空容器，等待 JS 注入）

GET /features  （Playwright 渲染后）
> 正文文本量：1,840 字 ✓
结论：不渲染 JS 的抓取链路无法读取该页核心正文，存在 AI/搜索可读性风险</div>
        </div>
      </div>

      <div class="find">
        <button class="find-head" aria-expanded="false">
          <span class="sev mid"></span>
          <span class="find-title">12 个词已有曝光但 CTR 异常低，疑似受 AI Overviews / SERP 特性影响</span>
          <span class="tag m"><span class="dot"></span>GSC 实测</span>
          <span class="find-conf">置信 中</span>
          <span class="chev">▶</span>
        </button>
        <div class="evidence">
          <div class="ev-label">证据 · Google Search Console（近 28 天）</div>
          <div class="ev-box" style="padding:6px 10px">
            <table class="gtable">
              <tr><th>查询</th><th>展示</th><th>点击</th><th>CTR</th><th>排名</th></tr>
              <tr><td>团队任务管理软件</td><td class="n">8,420</td><td class="n">71</td><td class="n">0.8%</td><td class="n">6.3</td></tr>
              <tr><td>项目进度跟踪工具</td><td class="n">5,110</td><td class="n">38</td><td class="n">0.7%</td><td class="n">7.1</td></tr>
              <tr><td>甘特图在线工具</td><td class="n">3,260</td><td class="n">19</td><td class="n">0.6%</td><td class="n">8.0</td></tr>
            </table>
          </div>
        </div>
      </div>

      <div class="find">
        <button class="find-head" aria-expanded="false">
          <span class="sev ok"></span>
          <span class="find-title">「teamflow 怎么样」类品牌词下，AI 描述准确、情绪正面（已具备，维持即可）</span>
          <span class="tag ok"><span class="dot"></span>已具备</span>
          <span class="find-conf">置信 高</span>
          <span class="chev">▶</span>
        </button>
        <div class="evidence">
          <div class="ev-label">证据 · Perplexity 实测回答原文</div>
          <div class="ev-box"><span class="nameyou">teamflow</span> 是一款面向中小团队的项目协作工具，以看板 + 甘特双视图和较低的上手成本著称……（描述与官方事实一致）</div>
        </div>
      </div>

    </div>
    <div class="note">所有数字均可溯源：实测来自 GSC / 真实 AI 回答 / 页面抓取；标「推断」的为模型估算（如竞品平均可见度），已明确区分。</div>
  </section>

  <!-- ================= STEP 3 RECOMMENDATIONS ================= -->
  <section class="screen" data-screen="3">
    <div class="sec-h"><h2>优化建议</h2><span class="meta">按「影响 × 置信 ÷ 工作量」排序 · 逐条确认后才进入输出</span></div>

    <div class="card rec">
      <div class="rec-top">
        <span class="prio">P1</span>
        <h3>把 /features 改为服务端渲染，降低非渲染抓取链路的可读性风险</h3>
        <div class="rec-actions">
          <button class="act acc">接受</button>
          <button class="act">编辑</button>
          <button class="act rej">否决</button>
        </div>
      </div>
      <div class="rec-body">
        <div class="field-block"><div class="fb-l">为什么</div><p>部分搜索和 AI 抓取链路不会执行完整客户端 JS。内容完全依赖前端渲染时，初始 HTML 缺少核心正文，可能降低被读取、理解和引用的机会。</p></div>
        <div class="field-block"><div class="fb-l">证据</div><div class="ev-ref">关闭 JS 抓取 /features → 正文 0 字；渲染后 1,840 字。详见诊断页证据。</div></div>
        <div class="field-block"><div class="fb-l">预期影响</div><p>使核心卖点内容进入初始 HTML，提高搜索与 AI 抓取链路读取概率；属高影响、可验证的技术问题。</p></div>
        <div class="field-block"><div class="fb-l">置信度</div><p><span class="tag m"><span class="dot"></span>硬 · 机制确定</span></p></div>
      </div>
    </div>

    <div class="card rec editing">
      <div class="rec-top">
        <span class="prio">P1</span>
        <h3>新增一篇「小团队项目管理工具选型」对比内容，争取被 AI 引用</h3>
        <div class="rec-actions">
          <button class="act acc on">编辑中</button>
          <button class="act">收起</button>
        </div>
      </div>
      <div class="edit-note"><span class="tag i"><span class="dot"></span>编辑中</span> 你正在调整内容角度与要注入的品牌事实，确认后将据此生成精确提示词</div>
      <div class="rec-body">
        <div class="field-block full"><div class="fb-l">内容角度（可编辑）</div>
          <textarea class="edit-area">答案前置 + FAQ 结构；正面对比 Asana/Notion/teamflow 在「小团队、预算有限、需要甘特图」场景下的取舍；用真实功能与定价，不贬低竞品。</textarea>
        </div>
        <div class="field-block full"><div class="fb-l">注入的品牌真实事实（不得编造）</div>
          <textarea class="edit-area">teamflow：免费档支持 10 人；看板+甘特双视图；中文文档与本地化客服；定价 ¥29/人/月起。</textarea>
        </div>
      </div>
    </div>

    <div class="card rec">
      <div class="rec-top">
        <span class="prio p2">P2</span>
        <h3>给高曝光低 CTR 的 12 个词，补 FAQ schema 与答案前置段落</h3>
        <div class="rec-actions">
          <button class="act acc">接受</button>
          <button class="act">编辑</button>
          <button class="act rej">否决</button>
        </div>
      </div>
      <div class="rec-body">
        <div class="field-block"><div class="fb-l">为什么</div><p>这些词已有真实曝光，排名 6–8 位但 CTR 不足 1%，疑似受 SERP 特性影响。补答案前置 + FAQ 有机会改善可读性、摘要匹配与点击表现，需回测验证。</p></div>
        <div class="field-block"><div class="fb-l">证据</div><div class="ev-ref">GSC：团队任务管理软件 展示 8,420 / CTR 0.8% / 排名 6.3。详见诊断页。</div></div>
        <div class="field-block"><div class="fb-l">预期影响</div><p>中影响、低工作量的快赢。</p></div>
        <div class="field-block"><div class="fb-l">置信度</div><p><span class="tag i"><span class="dot"></span>方向性 · GEO 概率性</span></p></div>
      </div>
    </div>

    <div class="note">人在环内：工具提议，你拍板。只有「已接受 / 已编辑」的建议进入下一步生成提示词。涉及站外（如知乎/社区）的建议只给话术草稿，不自动执行。</div>
  </section>

  <!-- ================= STEP 4 OUTPUT ================= -->
  <section class="screen" data-screen="4">
    <div class="sec-h"><h2>输出</h2><span class="meta">已确认 3 条 · 左侧复制提示词去执行，右侧导出报告</span></div>
    <div class="out-grid">
      <div>
        <div class="card prompt-card">
          <div class="pc-head"><span class="for">对应建议 · 新增小团队选型对比内容</span><button class="copy">复制提示词</button></div>
          <div class="prompt-body">你是资深 SEO+GEO 内容专家。请为 teamflow.cn 新增一篇内容，
目标：提升它在 ChatGPT/Perplexity 回答「适合小团队的项目管理工具推荐」时被正确理解、提及和引用的机会。

【必须真实使用、不得编造的品牌事实】
- 免费档支持 10 人；看板+甘特双视图；中文文档与本地客服；¥29/人/月起。

【当前问题（证据）】
- 该提问下 AI 现引用 zhihu 横评、asana.com、sspai 文章，全程未提 teamflow。

【硬性要求】
1. 一句直接回答开头（answer-first）
2. 正面对比 Asana / Notion / teamflow 在「小团队·预算有限·需甘特图」下的取舍
3. Q&A / FAQ 结构，问题用真实提问的变体
4. 每个论断给可验证的数据/来源，不贬低竞品
5. 核心正文需要出现在服务端可渲染纯文本中，降低非渲染抓取链路的读取风险
6. 自然对话式，不堆砌关键词

【输出】
- 可直接粘进 CMS 的正文（Markdown）
- 对应的 FAQPage JSON-LD 结构化数据</div>
        </div>

        <div class="card prompt-card">
          <div class="pc-head"><span class="for">对应建议 · /features 服务端渲染改造</span><button class="copy">复制提示词</button></div>
          <div class="prompt-body">你是前端工程师。teamflow.cn 的 /features 页内容靠客户端 JS 渲染，
非渲染抓取链路抓到的正文为 0 字。请给出改造方案：

【目标】核心卖点内容在服务端 HTML 中即可见（SSR / 预渲染 / 静态化任选），降低搜索与 AI 抓取风险
【约束】保留现有交互；首屏关键文本与 FAQ 必须出现在初始 HTML
【输出】1) 推荐方案与取舍 2) 关键改动点清单 3) 验证方法（关 JS 抓取应能看到正文）</div>
        </div>
      </div>

      <div class="card report">
        <h2>分析报告</h2>
        <div class="rmeta">teamflow.cn · 实测于 2026-06-29 · 可导出 PDF / 分享链接</div>
        <div class="rsec"><div class="rt">现状快照 <span class="tag m"><span class="dot"></span>实测</span></div><div class="rd">AI 可见度 6/20；平均自然排名 14.2；可被 AI 抓取页面 62%。</div></div>
        <div class="rsec"><div class="rt">竞品差距</div><div class="rd">你 SoV 30%，落后 Asana(70%)、Notion(55%)、Monday(45%)。</div></div>
        <div class="rsec"><div class="rt">关键问题（按优先级）</div><div class="rd">P1 落地页不可被 AI 抓取；P1 选型类提问全缺席；P2 高曝光低 CTR 快赢 12 词。每条附证据。</div></div>
        <div class="rsec"><div class="rt">建议与预期</div><div class="rd">已接受 3 条，生成对应执行提示词；预计先修可抓取性 + 1 篇选型内容，4–6 周后回测 SoV。</div></div>
        <div class="rsec"><div class="rt">回测计划 <span class="tag i"><span class="dot"></span>下一轮</span></div><div class="rd">6 周后重跑同 20 提问，量 SoV delta，写入行业活手册。</div></div>
        <button class="export">导出报告</button>
      </div>
    </div>
    <div class="note">「给提示词」而非「自动发布」：生成与发布留给人 + 人审，质量可控、不踩薄内容打压。后续可接 MCP 直写 CMS，但 v1 到精确提示词为止。</div>
  </section>
</div>

<div class="tip" id="tip"></div>

<script>
// ---- stepper ----
const steps=[...document.querySelectorAll('.step')];
const screens=[...document.querySelectorAll('.screen')];
function go(n){
  steps.forEach(s=>s.classList.toggle('active',s.dataset.s===n));
  screens.forEach(s=>s.classList.toggle('show',s.dataset.screen===n));
  window.scrollTo({top:0,behavior:'instant'});
}
steps.forEach(s=>s.addEventListener('click',()=>go(s.dataset.s)));

// ---- answer presence map ----
const prompts=[
 ["适合小团队的项目管理工具推荐",0],["best project management tool for small teams",0],
 ["Asana 和 Notion 哪个更适合远程团队",0],["免费的团队任务管理软件",1],
 ["甘特图在线协作工具",0],["创业公司用什么项目管理工具",0],
 ["teamflow 怎么样 好用吗",1],["项目进度跟踪软件推荐",0],
 ["中文项目管理工具 哪个好",1],["看板工具 trello 替代品",0],
 ["10 人团队协作软件",0],["带甘特图的免费工具",0],
 ["远程团队任务分配工具",0],["teamflow 定价",1],
 ["产品团队迭代管理工具",0],["敏捷开发看板工具推荐",0],
 ["低成本团队协作软件",1],["项目管理软件对比 2026",0],
 ["teamflow 和 asana 区别",1],["小公司用的免费办公协作工具",0]
];
const map=document.getElementById('map'),tip=document.getElementById('tip');
prompts.forEach(([q,on])=>{
  const c=document.createElement('div');
  c.className='cell'+(on?' on':'');c.tabIndex=0;
  c.setAttribute('aria-label',(on?'出现：':'缺席：')+q);
  const show=e=>{tip.textContent=(on?'✓ 你出现 · ':'✗ 你缺席 · ')+q;tip.style.opacity='1';
    const r=c.getBoundingClientRect();tip.style.left=Math.min(r.left,innerWidth-250)+'px';tip.style.top=(r.bottom+8)+'px';};
  const hide=()=>tip.style.opacity='0';
  c.addEventListener('mouseenter',show);c.addEventListener('mouseleave',hide);
  c.addEventListener('focus',show);c.addEventListener('blur',hide);
  map.appendChild(c);
});

// ---- findings expand ----
document.querySelectorAll('.find-head').forEach(h=>{
  h.addEventListener('click',()=>{const f=h.closest('.find');const o=f.classList.toggle('open');h.setAttribute('aria-expanded',o);});
});

// ---- findings tabs (visual only) ----
document.querySelectorAll('.tabs .tab').forEach(t=>t.addEventListener('click',()=>{
  t.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');
}));

// ---- recommendation accept/reject ----
document.querySelectorAll('.rec-actions .acc').forEach(b=>{
  if(b.textContent.trim()==='接受') b.addEventListener('click',()=>{b.classList.toggle('on');b.textContent=b.classList.contains('on')?'已接受':'接受';
    const rej=b.parentElement.querySelector('.rej');if(rej)rej.classList.remove('on');});
});
document.querySelectorAll('.rec-actions .rej').forEach(b=>{
  b.addEventListener('click',()=>{b.classList.toggle('on');const acc=b.parentElement.querySelector('.acc');
    if(acc){acc.classList.remove('on');acc.textContent='接受';}});
});

// ---- copy buttons ----
document.querySelectorAll('.copy').forEach(b=>{
  b.addEventListener('click',()=>{const txt=b.closest('.prompt-card').querySelector('.prompt-body').textContent;
    navigator.clipboard&&navigator.clipboard.writeText(txt).catch(()=>{});
    const o=b.textContent;b.textContent='已复制 ✓';b.classList.add('done');
    setTimeout(()=>{b.textContent=o;b.classList.remove('done');},1600);});
});
</script>
