type ResourceCardProps = {
  id: string;

  // One of imageUrl or itemUid must be provided
  imageUrl?: string;
  itemUid?: string;

  backgroundColor?: "purple" | "orange" | "blue";
  count?: number | string;
};

function ResourceCard({ imageUrl, itemUid, backgroundColor, count }: ResourceCardProps) {
  let backgroundColorClass = "bg-neutral-100 dark:bg-neutral-300";
  if (backgroundColor === "purple") {
    backgroundColorClass = "bg-purple-200 dark:bg-purple-300";
  } else if (backgroundColor === "orange") {
    backgroundColorClass = "bg-orange-200 dark:bg-orange-300";
  } else if (backgroundColor === "blue") {
    backgroundColorClass = "bg-blue-200 dark:bg-blue-300";
  }

  const card = (
    <div className={`relative p-1 flex items-center justify-center ${backgroundColorClass} transition rounded-lg`}>
      <img src={imageUrl ?? `https://baql-assets.mollulog.net/images/items/${itemUid}`} alt="자원 정보" />
      {(count !== undefined) && (
        <div className="px-2 absolute right-0 bottom-0 bg-red-500 text-white text-xs rounded-full">
          <span>{count}</span>
        </div>
      )}
    </div>
  )

  if (itemUid) {
    return (
      <a href={`https://schaledb.com/item/${itemUid}`} target="_blank" rel="noopener noreferrer" className="hover:scale-105 transition">
        {card}
      </a>
    )
  }
  return card;
}

export type ResourceCardsProps = {
  cardProps: ResourceCardProps[];
  mobileGrid?: 5 | 6;
};

export default function ResourceCards({ mobileGrid, cardProps }: ResourceCardsProps) {
  const mobileGridClass = mobileGrid === 5 ? "grid-cols-5" : "grid-cols-6";
  return (
    <div className={`my-2 grid ${mobileGridClass} md:grid-cols-10 gap-1 md:gap-2`}>
      {cardProps.map((prop) => (
        <ResourceCard key={prop.id} {...prop} />
      ))}
    </div>
  );
}
