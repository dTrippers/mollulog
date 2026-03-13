import { createContext, useContext, useState, type ReactNode } from "react";

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

  return (
    <StudentCardPopupContext.Provider value={{ activePopupId, setActivePopupId }}>
      {children}
    </StudentCardPopupContext.Provider>
  );
} 
