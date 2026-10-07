export type ChannelKind = "text" | "voice";

export interface Profile {
  id: string;
  display_name: string;
  age_verified_at: string | null;
  age_verification_method: string | null;
}

export interface Server {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  kind: ChannelKind;
  position: number;
}

export interface Message {
  id: number;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Member {
  server_id: string;
  user_id: string;
  role: "owner" | "member";
  profiles: Pick<Profile, "id" | "display_name"> | null;
}

export interface LiveKitGrant {
  token: string;
  room: string;
  url: string;
}
