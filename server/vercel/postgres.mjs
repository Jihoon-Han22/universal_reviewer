import pg from 'pg';

// Preserve the existing transactional repository and cost-accounting contracts.
// Only SQL dialect and transport change; no state is kept in a function instance.
export function postgresSql(sql) {
  let index=0;
  const ignore=/INSERT OR IGNORE/i.test(sql);
  let output=sql.replace(/INSERT OR IGNORE/gi,'INSERT').replace(/\bINTEGER\b/gi,'BIGINT').replace(/\bREAL\b/gi,'DOUBLE PRECISION').replace(/\?/g,()=>`$${++index}`);
  if(ignore)output+=' ON CONFLICT DO NOTHING';
  return output;
}
const numbers=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='string'&&['revision','created_at','updated_at','lease_fence','lease_expires_at','cancel_requested'].includes(key)&&/^\d+$/.test(value)?Number(value):value]));
export function createPostgresBinding(pool) {
  const execute=async(statement,client=pool)=>{const result=await client.query(postgresSql(statement.sql),statement.values);return {success:true,results:result.rows.map(numbers),meta:{changes:result.rowCount??0}};};
  const db={withSession(){return db;},prepare(sql){const statement={sql,values:[],bind(...values){return {...statement,values,run(){return execute(this);},async all(){return execute(this);},async first(){return (await execute(this)).results[0]??null;}};}};return statement.bind();},async batch(statements){const client=await pool.connect();try{await client.query('BEGIN');const results=[];for(const statement of statements)results.push(await execute(statement,client));await client.query('COMMIT');return results;}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}}};
  return db;
}
export function createDatabase(env) {
  const connectionString=env.POSTGRES_URL||env.DATABASE_URL;
  if(!connectionString)throw new Error('Vercel database connection is missing');
  return createPostgresBinding(new pg.Pool({connectionString,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:15000}));
}
