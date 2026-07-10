import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import App from "./App";
import { antdTheme } from "./theme/antd-theme";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConfigProvider theme={antdTheme}>
    <App />
  </ConfigProvider>,
);
