
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        AWS_REGION = 'ap-southeast-2'
        AWS_ACCOUNT_ID = '507941515612'
        ECR_REGISTRY = '507941515612.dkr.ecr.ap-southeast-2.amazonaws.com'
        IMAGE_TAG = 'v1.0.0'
    }

    stages {

        stage('Source Checkout') {
            steps {
                echo 'Source code checked out by Jenkins SCM'
            }
        }

        stage('Prepare Environment') {
            steps {
                bat '''
                    if not exist .env (
                        if not exist .env.example (
                            echo ERROR: .env.example is missing
                            exit /b 1
                        )
                        copy .env.example .env
                    )
                '''
            }
        }

        stage('Configuration Validation') {
            steps {
                bat 'docker compose config -q'
                echo 'Docker Compose configuration is valid'
            }
        }

        stage('Build Docker Images') {
            steps {
                bat 'docker compose build'
            }
        }

        stage('Application Tests') {
            steps {
                dir('services/user-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }

                dir('services/product-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }

                dir('services/order-service') {
                    bat 'npm ci'
                    bat 'npm test --if-present'
                }
            }
        }

        stage('AWS ECR Authentication') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'aws-ecr-jenkins',
                        usernameVariable: 'AWS_ACCESS_KEY_ID',
                        passwordVariable: 'AWS_SECRET_ACCESS_KEY'
                    )
                ]) {
                    bat '''
                        aws --version

                        aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %ECR_REGISTRY%

                        if errorlevel 1 exit /b 1
                    '''
                }
            }
        }

        stage('Push Images to ECR') {
            steps {
                bat '''
                    docker image inspect user-service:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 (
                        echo ERROR: user-service image not found
                        exit /b 1
                    )

                    docker image inspect product-service:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 (
                        echo ERROR: product-service image not found
                        exit /b 1
                    )

                    docker image inspect order-service:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 (
                        echo ERROR: order-service image not found
                        exit /b 1
                    )
                    docker image inspect frontend:%IMAGE_TAG% >nul 2>&1
                    if errorlevel 1 (
                        echo ERROR: Frontend image not found
                        exit /b 1
                    )

                    docker tag user-service:%IMAGE_TAG% %ECR_REGISTRY%/shopsphere-user:%IMAGE_TAG%
                    docker tag product-service:%IMAGE_TAG% %ECR_REGISTRY%/shopsphere-product:%IMAGE_TAG%
                    docker tag order-service:%IMAGE_TAG% %ECR_REGISTRY%/shopsphere-order:%IMAGE_TAG%
                    docker tag frontend:%IMAGE_TAG% %ECR_REGISTRY%/shopsphere-frontend:%IMAGE_TAG%

                    docker push %ECR_REGISTRY%/shopsphere-user:%IMAGE_TAG%
                    if errorlevel 1 exit /b 1

                    docker push %ECR_REGISTRY%/shopsphere-product:%IMAGE_TAG%
                    if errorlevel 1 exit /b 1

                    docker push %ECR_REGISTRY%/shopsphere-order:%IMAGE_TAG%
                    if errorlevel 1 exit /b 1

                    docker push %ECR_REGISTRY%/shopsphere-frontend:%IMAGE_TAG%
                    if errorlevel 1 exit /b 1

                    echo All three images pushed successfully!
                '''
            }
        }
    }

    post {
        success {
            echo 'CI/CD image publishing pipeline completed successfully!'
        }

        failure {
            echo 'Pipeline failed. Check console output.'
        }

        always {
            echo 'Pipeline execution finished.'
        }
    }
}
