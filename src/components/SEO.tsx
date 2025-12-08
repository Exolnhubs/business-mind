import { Title, Meta } from "react-head";

interface SEOProps {
    title: string;
    description: string;
    keywords?: string;
}

export const SEO = ({ title, description, keywords }: SEOProps) => (
    <>
        <Title>{title}</Title>
        <Meta name="description" content={description} />
        {keywords && <Meta name="keywords" content={keywords} />}
        {/* Optional: social sharing (Open Graph + Twitter cards) */}
        <Meta property="og:title" content={title} />
        <Meta property="og:description" content={description} />
        <Meta name="twitter:title" content={title} />
        <Meta name="twitter:description" content={description} />
    </>
);
