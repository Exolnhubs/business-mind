// src/components/Analytics.tsx
export const Analytics = () => {
    const GA_ID = import.meta.env.VITE_GA_ID;

    if (!GA_ID) {
        console.warn("⚠️ Google Analytics ID is missing (VITE_GA_ID).");
        return null;
    }

    return (
        <>
            {/* Google Analytics base script */}
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />

            {/* GA initialization */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { send_page_view: true });
          `,
                }}
            />
        </>
    );
};
