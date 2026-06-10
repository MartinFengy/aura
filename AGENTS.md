<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Handoff Notes

## Current Status

- 项目当前处于暂停开发、待交接状态
- 最近一轮重点工作集中在：
  - 图片识别链路质量收紧
  - 词阁移动端排版压缩
  - 云端同步与移动端交互优化

## Highest-Priority Follow-up

1. 用真实新闻长截图重新上传验证识别结果
2. 优先确认是否还存在假中文意思、假例句、碎片词条
3. 其次继续优化词阁手机端字体和布局密度

## Files Most Likely To Need Changes Next

- `src/app/api/analyze/route.ts`
- `src/app/(workspace)/lexicon/page.tsx`
- `src/app/(workspace)/reading/page.tsx`
- `src/components/aura/learning-workspace.tsx`

## Important Working Rule

- 当前阶段不要只改提示词来“感觉上修复”
- 必须结合真实上传结果验证问题是否真正消失
- 当前质量策略是：宁可少提，也不要产出错误词条
