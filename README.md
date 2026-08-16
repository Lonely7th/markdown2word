# Markdown2Word

`markdown2word.cn` 是一个独立的 Markdown 在线转换工具站，专注于 Markdown 转 Word（DOCX），并提供 PDF 作为辅助输出格式。

## 当前功能

- 粘贴 Markdown 或上传 `.md`、`.markdown`、`.txt` 文件
- 浏览器内实时预览标题、列表、引用、代码和表格
- 通过现有转换 API 生成 Word 或 PDF
- 微信扫码登录、会员状态查询和付款后二次确认
- Markdown 转 Word 中文教程、模板和兼容性内容集群
- 独立品牌路径，不跳转至 AIWhaler、应用商店或插件下载页

## 运行方式

项目是无构建步骤的静态站点，可直接由任意静态 Web 服务器托管。请通过 HTTP(S) 访问，不要直接使用 `file://` 打开，以确保跨域请求和浏览器存储行为与生产环境一致。

```text
index.html                首页与转换器
assets/converter.js       登录、会员和转换流程
assets/converter.css      转换器界面样式
assets/site.js            公共导航交互
assets/site.css           全站公共样式
guides/                   教程内容集群
templates/                Markdown 模板
compatibility/            DOCX 兼容性说明
privacy/                  数据处理说明
```

## 转换流程

1. 用户粘贴或上传 Markdown。
2. 页面通过微信二维码完成登录并查询会员状态。
3. 非会员可扫码付款，随后点击“已完成支付”重新验证。
4. 会员选择 Word 或 PDF，页面把内容和账户参数提交到对应接口。
5. 接口返回下载地址，页面自动触发下载并保留结果链接。

## 安全与隐私

登录凭证和会员状态保存在本站域名的 `localStorage` 中。Markdown 预览在浏览器内完成；只有用户主动转换时，内容才会提交至转换接口。不要提交密码、证件、未公开商业机密等敏感信息。详细说明见 [隐私说明](https://www.markdown2word.cn/privacy/)。

## 联系

- 网站：[https://www.markdown2word.cn/](https://www.markdown2word.cn/)
- 邮箱：[contact@markdown2word.cn](mailto:contact@markdown2word.cn)

Copyright © 2026 Markdown2Word.
