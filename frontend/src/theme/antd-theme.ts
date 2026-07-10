import type { ThemeConfig } from "antd";

export const antdTheme: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: "#00629B",
    colorPrimaryHover: "#004F7C",
    colorPrimaryActive: "#003F63",
    colorInfo: "#00629B",
    colorSuccess: "#00843D",
    colorWarning: "#FFB81C",
    colorError: "#BA0C2F",
    colorText: "#1F2933",
    colorTextSecondary: "#5B6770",
    colorBgBase: "#FFFFFF",
    colorBgLayout: "#F5F7FA",
    colorBgContainer: "#FFFFFF",
    colorBorder: "#D9DEE7",
    borderRadius: 6,
    borderRadiusLG: 6,
    borderRadiusSM: 4,
    fontFamily: "Roboto, Arial, Helvetica, sans-serif",
    fontSize: 14,
    fontSizeHeading1: 26,
    fontSizeHeading2: 22,
    fontWeightStrong: 700,
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 28,
    wireframe: false,
  },
  components: {
    Layout: {
      bodyBg: "#F5F7FA",
      headerBg: "#FFFFFF",
      siderBg: "#FFFFFF",
    },
    Card: {
      headerBg: "#FFFFFF",
    },
    Table: {
      headerBg: "#EEF3F7",
      headerColor: "#1F2933",
      rowHoverBg: "#F3F8FB",
    },
  },
};
