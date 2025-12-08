import { useEffect } from "react";
import { useSelector } from "react-redux";
import { selectDirection } from "@/store/slices/languageSlice"; // adjust path

const useDirection = () => {
  const direction = useSelector(selectDirection);

  useEffect(() => {
    document.body.setAttribute("dir", direction);
    document.body.style.direction = direction;
  }, [direction]);
};

export default useDirection;
