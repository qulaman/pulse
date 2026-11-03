import { NotesDesk } from "@/components/desk/notes/NotesDesk";

/** «Заметки» of the desk (D-153): the list stays on the left while the note or the board on the right changes. */
export default function DeskNotesLayout({ children }: { children: React.ReactNode }) {
  return <NotesDesk>{children}</NotesDesk>;
}
