export type Slide = {
  title: { en: string; ar: string };
  subtitle: { en: string; ar: string };
  description: { en: string; ar: string };
  bgcolor: string;
};


export interface articleProbs {
  id: number;
  subtitle?: {
    en: string;
    ar: string
  };
  title: {
    en: string;
    ar: string
  };
  description: {
    en: string;
    ar: string
  };
  image: string;
  date: string;
  slug?: string;
  featured?: boolean;
  ref: string;
  contentUrl?: {
    en: string;
    ar: string;
  };
  seo? : {
    en: {
      title: string;
      description: string;
      keywords: string[];
    };
    ar: {
      title: string;
      description: string;
      keywords: string[];
    };
  }

}

export interface procedureProbs {
  id: number;
  subtitle?: {
    en: string;
    ar: string
  };
  title: {
    en: string;
    ar: string
  };
  description: {
    en: string;
    ar: string
  };
  bgColor: string;
  date: string;
  featured?: boolean;
  ref: string;
}

export interface BannerProps {
  title: string;
  subtitle: string;
  action?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

import type { ReactNode } from "react";
export interface UpCounterProps {
  end: number;
  duration?: number;
  icon?: ReactNode;
  suffix?: string;
  prefix?: string;
  label?: string;
  fontSize?: string;
  color?: string;
}


export interface TrustCardProps {
  title: string;
  description: string;
}


export interface PlanProbs {
  title: { en: string; ar: string };
  text?: { en: string; ar: string };
  subtitle: { en: string; ar: string };
  description: { en: string; ar: string }[];
  whofor: { en: string; ar: string }[];
  info?: { en: string; ar: string };
  price?: { en: string; ar: string };
  features: { en: string; ar: string }[];
  Image?: string; // Optional image property
  icon?: {
    icon: React.ReactElement; // Icon component
    color: string; // Color for the icon
  }; // Optional icon property
  ref?: string;
}

export type TabContentItem = {
  title: { en: string; ar: string };
  body: { en: string; ar: string };
};


export interface SingleSlide {
  id: number;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  date?: string;
}

export interface SwiperSliderProps {
  slides: SingleSlide[];
}


export interface StatCardProps {
  title: { en: string; ar: string };
  number: { en: string; ar: string };
  subtitle: { en: string; ar: string };
}


import type { Service } from "../types/Service";

export interface ServiceListProps {
  isArabic: boolean;
  services: Service[];
  cardHeight?: {
    base?: string;
    md?: string;
    lg?: string;
  }
}


export interface ServiceCardProps {
  service: Service;
  isArabic: boolean;
  cardHeight: {
    base?: string;
    md?: string;
    lg?: string;
  };
}

export type Blog = {
  image: string;
  title: { en: string; ar: string };
  date: string;
  description: { en: string; ar: string };
  link?: string; // Optional: For Read blog button
};


export interface UserCommentProbs {
  name: {
    en: string;
    ar: string
  };
  avatar: string;
  comment: {
    en: string;
    ar: string
  };
}