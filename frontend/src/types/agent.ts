// 与 backend/src/models/agent.py 一一对应

export interface BigFive {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface DecisionStyle {
  info_processing: "intuitive" | "analytical" | "balanced";
  risk_preference: "averse" | "moderate" | "seeking";
  social_tendency: "competitive" | "cooperative" | "independent";
  stress_response: "avoidant" | "reactive" | "adaptive" | "resilient";
}

export interface Persona {
  mbti: string;
  big_five: BigFive;
  values: string[];
  decision_style: DecisionStyle;
  narrative: string;
}

export interface Background {
  hometown: string;
  family: string;
  education: string;
  key_events: string[];
}

export interface Goal {
  id: string;
  description: string;
  priority: number;
  deadline?: string;
  status: "active" | "achieved" | "abandoned";
}

export interface EmotionalState {
  valence: number;
  arousal: number;
  dominance: number;
  label: "happy" | "sad" | "angry" | "anxious" | "excited" | "neutral";
}

export interface AgentCreate {
  description: string;
}

export interface AgentResponse {
  id: string;
  name: string;
  persona: Persona;
  background: Background;
  goals: Goal[];
  emotional_state: EmotionalState;
  energy: number;
  created_at: string;
  updated_at: string;
}
