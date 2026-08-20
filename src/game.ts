export type Screen = "login" | "lobby" | "how" | "game" | "settings" | "leaderboards" | "gameover";
export type Status = "playing" | "paused" | "resolving";
export type Card = { id:string; label:string; value:number };
export type BoardSlot = { id:string; cards:Card[] };
export type Settings = { sound:boolean; music:boolean; haptics:boolean; reducedMotion:boolean; musicVolume:number; sfxVolume:number; language:string };
export type Game = { board:BoardSlot[]; held:Card[]; score:number; bestScore:number; quake:number; duration:number; remaining:number; status:Status; message:string };

export const LABELS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const valueOf = (label:string) => label === "A" ? 1 : ["J","Q","K"].includes(label) ? 10 : Number(label);
let cardIdSequence = 0;
const createCardId = () => globalThis.crypto?.randomUUID?.()
  ?? `card-${Date.now().toString(36)}-${(cardIdSequence++).toString(36)}-${Math.random().toString(36).slice(2)}`;
export const drawCard = ():Card => { const label=LABELS[Math.floor(Math.random()*LABELS.length)]; return {id:createCardId(),label,value:valueOf(label)} };
export const createBoard = ():BoardSlot[] => Array.from({length:25},(_,i)=>({id:`slot-${i+1}`,cards:[drawCard()]}));
export const roundDuration = (quake:number) => Math.max(5,60-(quake-1)*5);
export const formatScore = (score:number) => score.toString().padStart(4,"0");
export const total = (game:Game) => game.held.reduce((sum,card)=>sum+card.value,0);
export const initialGame = (bestScore=0):Game => ({board:createBoard(),held:[],score:0,bestScore,quake:0,duration:60,remaining:60,status:"playing",message:"BUILD 21 IN HOLDING"});

// Unity workflow: selecting pops the top card from a board stack. The rack
// resolves immediately; the player cannot return held cards manually.
export function selectSlot(game:Game,slotIndex:number):Game {
  if(game.status!=="playing") return game;
  const slot=game.board[slotIndex];
  if(!slot||slot.cards.length===0) return {...game,message:"THAT BOARD SLOT IS EMPTY"};
  if(game.held.length>=5) return {...game,held:[],message:"DEAD: HOLDING IS FULL"};
  const card=slot.cards[slot.cards.length-1];
  const board=game.board.map((s,i)=>i===slotIndex?{...s,cards:s.cards.slice(0,-1)}:s);
  const held=[...game.held,card];
  const sum=held.reduce((n,c)=>n+c.value,0);
  if(sum===21){
    const score=game.score+held.length*50;
    return {...game,board,held:[],score,bestScore:Math.max(score,game.bestScore),message:`21 WITH ${held.length} TILES: +${held.length*50}`};
  }
  if(sum>21) return {...game,board,held:[],message:`BUST: ${sum} IS OVER 21`};
  if(held.length>=5) return {...game,board,held:[],message:`DEAD: 5 TILES TOTAL ${sum}`};
  return {...game,board,held,message:`HOLDING TOTAL: ${sum} / 21`};
}

// Both timer expiry and the manual button use this exact quake operation.
export function triggerQuake(game:Game):Game {
  if(game.status!=="playing") return game;
  const board=game.board.map(slot=>({...slot,cards:[...slot.cards]}));
  for(let i=0;i<3;i++) board[Math.floor(Math.random()*board.length)].cards.push(drawCard());
  const quake=game.quake+1;
  const duration=roundDuration(quake+1);
  return {...game,board,quake,duration,remaining:duration,message:`QUAKE ${quake}! NEXT QUAKE IN ${duration} SECONDS`};
}

export function tick(game:Game,delta:number):Game {
  if(game.status!=="playing") return game;
  const remaining=Math.max(0,game.remaining-delta);
  return remaining===0?triggerQuake({...game,remaining:0}):{...game,remaining};
}
