type KeyValueTableProps = {
  items: {
    key: string;
    value: string | React.ReactNode;
  }[];
  keyPrefix: string;
};

export default function KeyValueTable({ items, keyPrefix }: KeyValueTableProps) {
  return (
    <div className="flex text-sm">
      <div className="mr-4 text-neutral-500 dark:text-neutral-400">
        {items.map(({ key }) => <p key={`${keyPrefix}-key-${key}`}>{key}</p>)}
      </div>
      <div className="text-neutral-700 dark:text-neutral-200">
        {items.map(({ key, value }) => {
          if (typeof value === "string") {
            return <p key={`${keyPrefix}-value-${key}`}>{value}</p>;
          }
          return <div key={`${keyPrefix}-value-${key}`}>{value}</div>;
        })}
      </div>
    </div>
  );
}
