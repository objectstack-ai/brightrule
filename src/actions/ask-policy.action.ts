import { defineAction } from '@objectstack/spec/ui';

/**
 * 问这份制度 — 在制度页标题栏和制度库每一行的菜单里，打开 AI 问询并钉住这份制度。
 *
 * `ask_ai` 不在服务端执行，也不是 AI 工具：控制台把助手聚焦到当前记录，助手按
 * 资料包 brightrule_policy_reading（src/ai-contexts）读这份制度。没有站内助手的环境里
 * 这个按钮不显示。
 */
export const AskPolicyAction = defineAction({
  name: 'brightrule_policy_ask',
  label: '问这份制度',
  icon: 'message-circle-question',
  objectName: 'brightrule_policy',
  type: 'ask_ai',
  locations: ['record'],
});
