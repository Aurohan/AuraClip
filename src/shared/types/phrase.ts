export interface QuickPhrase {
  id: number;
  title: string;
  content: string;
  tags: string[];
  isSensitive: boolean;
  sortOrder: number;
  useCount: number;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number | null;
}
