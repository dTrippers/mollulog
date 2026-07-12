import { Form, Link } from "react-router";
import { useState } from "react";
import { cn } from "~/lib/utils";

export type ActionCardAction = {
  text: string;
  color?: "red" | "default";
  link?: string;
  form?: {
    method: "post" | "patch" | "delete";
    hiddenInputs: { name: string; value: string }[];
  };
  popup?: (close: () => void) => React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
};

type ActionCardProps = {
  children: React.ReactNode | React.ReactNode[];
  actions: ActionCardAction[];
};

export default function ActionCard({ children, actions }: ActionCardProps) {
  const [remindDangerAction, setRemindDangerAction] = useState<ActionCardAction | null>(null);

  return (
    <div className="my-4 p-4 md:p-6 rounded-lg bg-neutral-100 dark:bg-neutral-900">
      <div>{children}</div>

      {actions.length > 0 && (
        <div className="mt-4 -mb-2 flex items-center justify-end">
          {remindDangerAction ? (
            <>
              <p className="mr-2">정말로 {remindDangerAction.text} 할까요?</p>
              <ActionButton action={{ text: "취소", onClick: () => setRemindDangerAction(null) }} />
              <ActionButton action={remindDangerAction} />
            </>
          ) : (
            actions.map((action) => (
              <ActionButton key={getActionKey(action)} action={action} setRemindDangerAction={setRemindDangerAction} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

type ActionButtonProps = {
  action: ActionCardAction;
  setRemindDangerAction?: (action: ActionCardAction | null) => void;
};

function ActionButton({ action, setRemindDangerAction }: ActionButtonProps) {
  const [showPopup, setShowPopup] = useState(false);
  const buttonOnClick = getActionButtonOnClick(action, setRemindDangerAction, () => setShowPopup((prev) => !prev));
  const buttonClassName = getActionButtonClassName(action.color);

  if (action.danger && setRemindDangerAction) {
    return (
      <button type="button" className={buttonClassName} onClick={buttonOnClick}>
        {action.text}
      </button>
    );
  }

  if (action.link) {
    return (
      <Link to={action.link} target={action.link.startsWith("http") ? "_blank" : undefined} className={buttonClassName}>
        {action.text}
      </Link>
    );
  }

  if (action.form) {
    return (
      <Form method={action.form.method}>
        {action.form.hiddenInputs.map((input) => (
          <input key={input.name} type="hidden" name={input.name} value={input.value} />
        ))}
        <button type="submit" className={buttonClassName}>
          {action.text}
        </button>
      </Form>
    );
  }

  if (action.popup) {
    return (
      <div className="relative">
        <button type="button" className={buttonClassName} onClick={buttonOnClick}>
          {action.text}
        </button>
        {showPopup && (
          <div className="absolute right-0 top-0 mt-12 p-4 w-64 bg-white shadow-lg rounded-lg z-10">
            {action.popup(() => setShowPopup(false))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button type="button" className={buttonClassName} onClick={buttonOnClick}>
      {action.text}
    </button>
  );
}

function getActionKey(action: ActionCardAction) {
  if (action.link) {
    return `${action.text}-${action.link}`;
  }

  if (action.form) {
    return `${action.text}-${action.form.method}-${action.form.hiddenInputs.map((input) => `${input.name}:${input.value}`).join(",")}`;
  }

  return action.text;
}

function getActionButtonClassName(color: ActionCardAction["color"]) {
  return cn(`
    -mx-1 px-4 py-2 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-semibold text-sm transition rounded-lg
    ${color === "red" ? "text-red-500" : "text-neutral-500 dark:text-neutral-200"}
  `);
}

function getActionButtonOnClick(
  action: ActionCardAction,
  setRemindDangerAction?: (action: ActionCardAction | null) => void,
  togglePopup?: () => void,
) {
  if (action.onClick) {
    return action.onClick;
  }

  if (action.popup) {
    return togglePopup;
  }

  if (action.danger && setRemindDangerAction) {
    return () => setRemindDangerAction(action);
  }

  return undefined;
}
