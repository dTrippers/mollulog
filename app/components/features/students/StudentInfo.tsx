import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import { attackTypeColor, attackTypeLocale, defenseTypeColor, defenseTypeLocale, roleColor, roleLocale, schoolNameLocale } from "~/locales/ko";
import { OptionBadge } from "~/components/atoms/student";
import { studentStandingImageUrl } from "~/models/assets";

type StudentInfoProps = {
  student: {
    name: string;
    uid: string;
    school: string;
    attackType: string;
    defenseType: string;
    role: string;
    schaleDbId?: string | null;
  };
  className?: string;
};

export default function StudentInfo({ student, className = "" }: StudentInfoProps) {
  return (
    <div className={`w-full aspect-16/9 flex rounded-xl bg-neutral-100 dark:bg-neutral-900 ${className}`}>
      <div className="p-4 md:p-8 grow flex flex-col justify-center z-10">
        <p className="text-xl md:text-2xl font-bold">{student.name}</p>
        <p className="my-1 md:my-2">{schoolNameLocale[student.school as keyof typeof schoolNameLocale]}</p>
        <div className="flex gap-2">
          <OptionBadge 
            text={attackTypeLocale[student.attackType as keyof typeof attackTypeLocale]} 
            color={attackTypeColor[student.attackType as keyof typeof attackTypeColor]} 
          />
          <OptionBadge 
            text={defenseTypeLocale[student.defenseType as keyof typeof defenseTypeLocale]} 
            color={defenseTypeColor[student.defenseType as keyof typeof defenseTypeColor]} 
          />
          <OptionBadge 
            text={roleLocale[student.role as keyof typeof roleLocale]} 
            color={roleColor[student.role as keyof typeof roleColor]} 
          />
        </div>
        {student.schaleDbId && (
          <a 
            href={`https://schaledb.com/student/${student.schaleDbId}`} 
            target="_blank" 
            rel="noreferrer" 
            className="pt-4 hover:underline"
          >
            <ArrowTopRightOnSquareIcon className="size-3 text-neutral-500 inline" />
            <span className="text-sm text-neutral-500">샬레DB</span>
          </a>
        )}
      </div>
      <div className="relative w-1/3 h-full overflow-hidden rounded-r-xl">
        <img
          src={studentStandingImageUrl(student.uid)}
          alt={student.name}
          className="absolute w-full h-full object-cover object-top scale-125 translate-y-1/20 transform-gpu origin-top"
        />
        <div className="absolute w-full h-full bg-linear-to-r from-neutral-100 dark:from-neutral-900 to-transparent to-15%" />
      </div>
    </div>
  );
}
