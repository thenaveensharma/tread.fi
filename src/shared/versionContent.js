// VERSION: v6.1.39
// IMPORTANT: When updating taas_app version data, update the version number in this comment on the first line
// This version number is used by the backend API endpoint get_VersionData
export const versionContentData = {
  date: "November 11, 2025",
  marketAccessVersion: "v6.1.39",
  features: [
    {
      title: "New",
      items: [
        {
          title: "Paradex exchange support",
          description: "You can now connect Paradex in Key Management with wallet-based approval flow.",
          image: {
            src: "https://luminous-ganache-c828dc.netlify.app/images/treadfiparadex.jpg",
            alt: "Paradex integration banner showing trade interface"
          }
        },
        {
          title: "CSV bulk order upload",
          description: "Institutional users can upload orders via CSV in Dashboard → Order Entry."
        }
      ]
    },
    {
      title: "Improvements",
      items: [
        {
          title: "Delta Neutral bot execution tuned",
          description: "Increased default execution POV and multiple stability/UX improvements to entry and positions views."
        },
        {
          title: "Market Maker form accuracy",
          description: "Margin requirement recalculates after leverage changes for clearer pre-trade checks."
        },
        {
          title: "More consistent bot order data",
          description: "Consolidated order retrieval for Market Maker and Delta Neutral flows for more reliable history/positions."
        }
      ]
    }
  ]
};
