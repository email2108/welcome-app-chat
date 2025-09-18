import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authConfig = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // This is a simple demo authentication
        // In a real app, you'd verify against a database
        if (credentials?.username && credentials?.password) {
          // Simple demo: accept any non-empty credentials
          // In production, implement proper authentication
          return {
            id: Math.random().toString(36).substring(7),
            name: credentials.username,
            email: `${credentials.username}@example.com`
          }
        }
        return null
      }
    })
  ],
  pages: {
    signIn: '/auth/signin'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
      }
      return session
    }
  },
  session: {
    strategy: 'jwt' as const
  }
}