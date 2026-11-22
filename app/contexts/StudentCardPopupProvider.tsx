import { createContext, type ReactNode, useContext, useState } from "react";
import { useLocation } from "react-router";

type StudentCardPopupContextType = {
  activePopupId: string | null;
  setActivePopupId: (id: string | null) => void;
};

const StudentCardPopupContext = createContext<StudentCardPopupContextType>({
  activePopupId: null,
  setActivePopupId: () => {},
});

export function useStudentCardPopup() {
  return useContext(StudentCardPopupContext);
}

export function StudentCardPopupProvider({ children }: { children: ReactNode }) {
  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  const { pathname } = useLocation();
  const [popupPathname, setPopupPathname] = useState(pathname);

  // A popup belongs to the page it was opened on, so it closes in the same render that shows the next page.
  if (popupPathname !== pathname) {
    setPopupPathname(pathname);
    setActivePopupId(null);
  }

  return (
    <StudentCardPopupContext.Provider value={{ activePopupId, setActivePopupId }}>
      {children}
    </StudentCardPopupContext.Provider>
  );
}
