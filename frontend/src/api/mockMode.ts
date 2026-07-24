/** Mock 开关只在 API 层读取，页面与组件不感知数据来源。 */
export const isMockApi = import.meta.env.VITE_MOCK_API === "true";
