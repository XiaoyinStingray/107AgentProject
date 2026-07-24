import type { AgentResponse } from "../types/agent";

export const MOCK_AGENT_RESPONSE: AgentResponse = {
  id: "mock-1",
  name: "小明",
  persona: {
    name: "小明",
    mbti: "INTJ-T",
    big_five: {
      openness: 0.7,
      conscientiousness: 0.85,
      extraversion: 0.25,
      agreeableness: 0.5,
      neuroticism: 0.6,
    },
    values: ["成就", "独立", "效率"],
    decision_style: {
      info_processing: "analytical",
      risk_preference: "moderate",
      social_tendency: "independent",
      stress_response: "adaptive",
    },
    narrative:
      "小明是一个来自小镇的年轻人，高考全县第一的成绩让他进入了顶尖大学的计算机系。他习惯了一个人战斗，相信实力比关系更重要。内心深处，他渴望被认可，但又害怕暴露自己的弱点。在群体中，他往往是那个沉默但关键时刻一锤定音的人。",
  },
  background: {
    hometown: "安徽某县城",
    family: "父母务农，独生子",
    education: "中科大计算机系大二",
    key_events: ["高考全县第一", "大一编程比赛失利"],
  },
  goals: [
    {
      id: "g1",
      description: "保研清华",
      priority: 1,
      status: "active",
      progress: 0,
    },
    {
      id: "g2",
      description: "找到志同道合的队友",
      priority: 2,
      status: "active",
      progress: 0,
    },
  ],
  emotional_state: {
    valence: 0.6,
    arousal: 0.5,
    dominance: 0.7,
    label: "neutral",
  },
  energy: 85,
  created_at: "2026-07-16T10:00:00Z",
  updated_at: "2026-07-16T10:00:00Z",
};

/** 3 个风格不同的 Mock Agent，用于列表展示 */
export const MOCK_AGENTS: AgentResponse[] = [
  MOCK_AGENT_RESPONSE,
  {
    id: "mock-2",
    name: "小红",
    persona: {
      name: "小红",
      mbti: "ENFP-A",
      big_five: {
        openness: 0.9,
        conscientiousness: 0.4,
        extraversion: 0.85,
        agreeableness: 0.8,
        neuroticism: 0.35,
      },
      values: ["自由", "连接", "成长"],
      decision_style: {
        info_processing: "intuitive",
        risk_preference: "seeking",
        social_tendency: "cooperative",
        stress_response: "adaptive",
      },
      narrative:
        "小红是校园里的社交蝴蝶。她相信每个人都是一本书，而她想要读完所有。对新鲜事物的好奇心让她永远在尝试新东西——但也让她很难专注于一件事。她害怕无聊胜过害怕失败。",
    },
    background: {
      hometown: "成都",
      family: "父母都是教师，有一个妹妹",
      education: "中科大传播系大三",
      key_events: ["创办校园自媒体", "组织过 3 场 TEDx"],
    },
    goals: [
      {
        id: "g1",
        description: "拿到大厂产品经理 offer",
        priority: 1,
        status: "active",
        progress: 0,
      },
    ],
    emotional_state: {
      valence: 0.75,
      arousal: 0.7,
      dominance: 0.6,
      label: "excited",
    },
    energy: 72,
    created_at: "2026-07-16T11:00:00Z",
    updated_at: "2026-07-16T11:00:00Z",
  },
  {
    id: "mock-3",
    name: "小刚",
    persona: {
      name: "小刚",
      mbti: "ESTJ-A",
      big_five: {
        openness: 0.3,
        conscientiousness: 0.9,
        extraversion: 0.65,
        agreeableness: 0.3,
        neuroticism: 0.2,
      },
      values: ["秩序", "效率", "胜利"],
      decision_style: {
        info_processing: "analytical",
        risk_preference: "moderate",
        social_tendency: "competitive",
        stress_response: "resilient",
      },
      narrative:
        "小刚是那种你把任何任务交给他都能放心的人。他的日程表精确到分钟，GPA 永远是第一。在他看来，世界是一场比赛，而他不想输。但有时候他会怀疑——赢了之后呢？",
    },
    background: {
      hometown: "北京",
      family: "父亲是企业高管，母亲是医生",
      education: "中科大金融系大四",
      key_events: ["学生会主席", "顶级投行实习"],
    },
    goals: [
      {
        id: "g1",
        description: "进入 Top 3 咨询公司",
        priority: 1,
        status: "active",
        progress: 0,
      },
      {
        id: "g2",
        description: "维持专业第一",
        priority: 1,
        status: "active",
        progress: 0,
      },
    ],
    emotional_state: {
      valence: 0.55,
      arousal: 0.6,
      dominance: 0.8,
      label: "neutral",
    },
    energy: 90,
    created_at: "2026-07-16T12:00:00Z",
    updated_at: "2026-07-16T12:00:00Z",
  },
];
