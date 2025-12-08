// types.ts (optional for reusability)
export interface Service {
    icon: React.ReactNode;
    title: {
      en: string;
      ar: string;
    };
    description: {
      en: string;
      ar: string;
    };
    link?: string;
    circle?: boolean;
    flipColor?: string;
    bgColor?: string;
    textColor?: string;
  }
  