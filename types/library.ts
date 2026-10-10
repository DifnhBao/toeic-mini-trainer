export type LibraryLesson = {
  id: string;
  title: string;
  parts: number[];
  questionCount: number;
  playable: boolean;
  unavailableReason: string | null;
  hasAudio: boolean;
  hasImage: boolean;
  createdAt: string;
};
export type LibraryCatalogue = { lessons: LibraryLesson[]; nextCursor: string | null };
