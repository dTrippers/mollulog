import { itemImageUrl } from "~/models/assets";

export type ItemCardProps = {
  name: string;
  imageId: string;
  label?: string;
  labelClassName?: string;
};

export default function ItemCard({ name, imageId, label, labelClassName }: ItemCardProps) {
  return (
    <div className="w-12 md:w-12 relative text-white">
      <img
        src={itemImageUrl(imageId)}
        alt={name}
        loading="lazy"
      />
      {label && (
        <div className={`absolute bottom-0 right-0 px-1 bg-black/75 text-center font-bold text-xs rounded-lg ${labelClassName ?? ""}`}>
          {label}
        </div>
      )}
    </div>
  );
}
