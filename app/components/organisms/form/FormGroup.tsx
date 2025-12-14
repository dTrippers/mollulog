import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { createContext, type ReactNode, useCallback, useContext, useRef } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

type FormGroupProps = {
  method?: "post" | "put" | "patch" | "delete";
  children: ReactNode | ReactNode[];

  submitOnChange?: boolean;
  showSavingIndicator?: boolean;
};

const FormGroupContext = createContext<{
  submitFormGroup: () => void;
}>({
  submitFormGroup: () => {},
});

export default function FormGroup({ method, children, submitOnChange, showSavingIndicator }: FormGroupProps) {
  const childrenArray = Array.isArray(children) ? children.flat() : [children];

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = useSubmit();
  const debouncedSubmit = useCallback((form: HTMLFormElement) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      submit(form, { method: method });
    }, 300);
  }, [submit]);

  const layout = (
    <>
      <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg">
        {childrenArray.filter(Boolean).map((child, index) => (
          <div key={index} className="first:rounded-t-lg last:rounded-b-lg not-last:border-b border-neutral-200 dark:border-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-950 transition">
            {child}
          </div>
        ))}
      </div>
      {showSavingIndicator && (
        <div className={`my-2 flex justify-end items-center gap-x-2 ${isSubmitting ? "visible" : "invisible"}`}>
          <ArrowPathIcon className="size-4 animate-spin" />
          <p className="text-right text-sm">저장중...</p>
        </div>
      )}
    </>
  );

  if (method) {
    return (
      <FormGroupContext.Provider value={{ submitFormGroup: () => submitOnChange && formRef.current && debouncedSubmit(formRef.current) }}>
        <Form method={method} ref={formRef} onChange={(e) => submitOnChange && debouncedSubmit(e.currentTarget)}>
          {layout}
        </Form>
      </FormGroupContext.Provider>
    );
  }
  return layout;
};

export function useFormGroup() {
  return useContext(FormGroupContext);
}
