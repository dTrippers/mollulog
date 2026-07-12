import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { Children, createContext, isValidElement, type ReactNode, useCallback, useContext, useRef } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

type FormGroupProps = {
  method?: "post" | "put" | "patch" | "delete";
  children: ReactNode | ReactNode[];
  submitOnChange?: boolean;
  showSavingIndicator?: boolean;
  itemHover?: boolean;
};

const FormGroupContext = createContext<{
  submitFormGroup: () => void;
}>({
  submitFormGroup: () => {},
});

export default function FormGroup({
  method,
  children,
  submitOnChange,
  showSavingIndicator,
  itemHover = true,
}: FormGroupProps) {
  const childrenArray = Children.toArray(children);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const submit = useSubmit();

  const debouncedSubmit = useCallback(
    (form: HTMLFormElement) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        submit(form, { method });
      }, 300);
    },
    [method, submit],
  );

  const layout = (
    <>
      <div className="rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        {childrenArray.map((child) => (
          <div
            key={isValidElement(child) ? (child.key ?? child.type?.toString?.() ?? "child") : String(child)}
            className={`border-border transition-colors first:rounded-t-lg last:rounded-b-lg not-last:border-b ${itemHover ? "hover:bg-muted" : ""}`}
          >
            {child}
          </div>
        ))}
      </div>
      {showSavingIndicator && (
        <div className={`my-2 flex items-center justify-end gap-x-2 ${isSubmitting ? "visible" : "invisible"}`}>
          <ArrowPathIcon className="size-4 animate-spin" />
          <p className="text-right text-sm">저장중...</p>
        </div>
      )}
    </>
  );

  if (!method) {
    return layout;
  }

  return (
    <FormGroupContext.Provider
      value={{
        submitFormGroup: () => {
          if (submitOnChange && formRef.current) {
            debouncedSubmit(formRef.current);
          }
        },
      }}
    >
      <Form
        method={method}
        ref={formRef}
        onChange={(event) => {
          if (submitOnChange) {
            debouncedSubmit(event.currentTarget);
          }
        }}
      >
        {layout}
      </Form>
    </FormGroupContext.Provider>
  );
}

export function useFormGroup() {
  return useContext(FormGroupContext);
}
