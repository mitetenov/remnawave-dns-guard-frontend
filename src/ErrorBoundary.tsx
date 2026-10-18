import {Component,type ReactNode} from 'react';

export default class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="auth-page"><div className="auth-card"><h1>Не удалось открыть страницу</h1><p>Вернитесь на обзор и повторите действие.</p><button className="button primary full" onClick={()=>{window.location.hash='overview';this.setState({failed:false});}}>Открыть обзор</button></div></main>;
 }
}
