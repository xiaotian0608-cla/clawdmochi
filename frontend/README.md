# TianKe 专属前端

参考小克Cat 专属前端的液态玻璃(Glass)材质写法搭建的基础框架，纯 HTML/CSS/JS，无需构建工具，直接用浏览器打开 `src/web/index.html` 即可预览。

## 目录结构

```
frontend/
  docs/design/tokens.css   设计变量：色板、间距、圆角、玻璃 token
  src/web/index.html       页面结构：开屏、顶部栏、消息区、快捷指令、输入框
  src/web/styles.css       样式，引用 tokens.css
  src/web/app.js           交互逻辑：主题切换、发送消息、开屏隐藏
```

## 玻璃材质写法

沿用小克Cat 的三条约定（详见 `docs/design/tokens.css` 顶部注释）：

1. 玻璃永远画在独立的 `::before` 背景层上，不直接加在承载真实内容（尤其是 `textarea`）的那一层；容器加 `isolation: isolate` 建立新的合成层，避免 iOS 键盘换帧期间光标沿用旧坐标。
2. 视觉配方固定三件套：半透明渐变背景 + 内外描边高光（`box-shadow` 的 `0 0 0 1px` 与 `inset 0 1px 0`）+ `backdrop-filter(blur + saturate)`，`saturate` 取 116%~145%。
3. 变量命名分两层：全局唯一的 `--glass-blur` 控制基础模糊强度；按「场景-用途」命名一整套 `fill/border/shadow` token（如 `--glass-composer-fill`），方便复用又能单独微调。

当前已实现：顶部栏 `#app-header`、输入框 `#composer`、AI 消息气泡 `.msg-group--ai .msg-bubble` 均按此配方接入玻璃层，`night` 主题下自动切换配色。

## 待接入

- `app.js` 里的 `mockReply()` 是占位逻辑，接真实后端时替换成实际请求。
- `#quick-actions` 里的快捷指令目前只是本地回显，可按 `data-action` 接步数/定位/拍照等真实数据源。
- `#app::before` 目前用渐变占位当壁纸，有真实壁纸图后把 `background-image` 换成图片地址，并按需在 `[data-theme="night"]` 下调整透明度或隐藏。
