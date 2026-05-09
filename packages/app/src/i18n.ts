import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "app.title": "GraphOS",
      "app.description": "AI-Operable Graph Runtime",
      "sidebar.nodes": "Available Nodes",
      "sidebar.graphs": "My Graphs",
      "sidebar.duplicate": "Duplicate",
      "sidebar.history": "File History",
      "sidebar.history_empty": "No change history",
      "sidebar.restore": "Restore",
      "sidebar.restoring": "Restoring...",
      "sidebar.new_graph": "New Graph",
      "sidebar.properties": "Properties",
      "graph.empty": "Drag nodes here to start building",
      "node.http.request": "HTTP Request",
      "node.logic.branch": "Logic Branch",
      "node.ai.summary": "AI Summary",
      "node.text": "Text Node",
      "property.label": "Node Label",
      "property.description": "Description",
      "common.save": "Save",
      "common.cancel": "Cancel",
      "common.run": "Run Graph",
      "theme.light": "Light Mode",
      "theme.dark": "Dark Mode"
    }
  },
  zh: {
    translation: {
      "app.title": "GraphOS",
      "app.description": "AI 可操作图运行时",
      "sidebar.nodes": "可用节点",
      "sidebar.graphs": "我的图表",
      "sidebar.duplicate": "复制",
      "sidebar.history": "修改记录",
      "sidebar.history_empty": "暂无修改记录",
      "sidebar.restore": "恢复",
      "sidebar.restoring": "恢复中...",
      "sidebar.new_graph": "新建图表",
      "sidebar.properties": "属性编辑",
      "graph.empty": "拖拽节点到此处开始构建",
      "node.http.request": "HTTP 请求",
      "node.logic.branch": "逻辑分支",
      "node.ai.summary": "AI 总结",
      "node.text": "文本节点",
      "property.label": "节点标签",
      "property.description": "描述信息",
      "common.save": "保存",
      "common.cancel": "取消",
      "common.run": "运行图",
      "theme.light": "浅色模式",
      "theme.dark": "深色模式"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
