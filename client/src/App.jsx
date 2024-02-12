import './App.css'
 
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Sign from "./components/Sign";
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <>
      <BrowserRouter>
      <Routes>
        <Route path="/signin" element={<SignInPage />}/>
        <Route path="/signup" element={<SignUpPage />}/>
        <Route path="/" element={<Dashboard />} />
      </Routes>

      </BrowserRouter>
      {/* <Sign /> */}
    </>
  )

}

export default App
