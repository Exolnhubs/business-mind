
// hooks/useSwiperDirectionFix.ts
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { SwiperRef } from "swiper/react";
import type { LanguageState } from "@/store/slices/languageSlice";

const useSwiperDirectionFix = () => {
  const direction = useSelector(
    (state: { language: LanguageState }) => state.language.direction
  );
  
  const swiperRef = useRef<SwiperRef>(null);
  const [key, setKey] = useState(0); // ✅ Key to force re-render

  useEffect(() => {
    
    const swiperInstance = swiperRef.current?.swiper;
    
    if (swiperInstance) {
      try {
        // ✅ Method 1: Update existing instance
        const el = swiperInstance.el as HTMLElement;
        el.setAttribute("dir", direction);
        
        // ✅ Destroy and recreate for better compatibility
        swiperInstance.destroy(true, true);
        
        // ✅ Force component re-render with new key
        setKey(prev => prev + 1);
        
      } catch (error) {
        console.error("Error updating Swiper direction:", error);
        // ✅ Fallback: force re-render
        setKey(prev => prev + 1);
      }
    } else {
      // ✅ If no instance yet, just force re-render
      setKey(prev => prev + 1);
    }
  }, [direction]);

  return { swiperRef, direction, key };
};

export default useSwiperDirectionFix;