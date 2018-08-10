pipeline {
  agent {
    node {
      label 'pool_build'
    } 
  }
  stages {
    stage('Initialize') {
      steps {
        sh 'set -x; export BITGOJS_TEST_PASSWORD=${BITGOJS_TEST_PASSWORD}'
      }
    }

    stage('Build') {
      steps {
        sh 'echo "Run npm install here..."'
      }
    }

    stage("Dev Tests") {
      steps {
	parallel (
	  "Unit Test" : {
            node('pool_build') {
	      git(
		url: 'git@github.com:BitGo/BitGoJS.git',
		credentialsId: 'bitgo',
		branch: "$branch"
	      )
              sh 'cd $WORKSPACE; npm install; npm run test'
            }
	  },

          "Code Coverage" : {
            node('pool_build') {
              git(
                url: 'git@github.com:BitGo/BitGoJS.git',
                credentialsId: 'bitgo',
                branch: "$branch"
              )
              sh 'cd $WORKSPACE; npm install; npm run coverage'
            }
          },

          "Lint" : {
            node('pool_build') {
              git(
                url: 'git@github.com:BitGo/BitGoJS.git',
                credentialsId: 'bitgo',
                branch: "$branch"
              )
              sh 'cd $WORKSPACE; npm install; npm run lint'
            }
          }
	)
      }
    }

    stage('Test Integration') {
      steps {
        sh 'npm run test-integration'
      }
    }

    stage('Test Report') {
      steps {
        echo 'Set up reports here'
      }
    }
  }
}
